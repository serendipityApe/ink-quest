import assert from "node:assert/strict";
import {test} from "node:test";
import {build} from "esbuild";
import {fileURLToPath} from "node:url";
import {dirname,join} from "node:path";

interface ApiFixture {
  getUser():Promise<{id:string}|null>;
  rpc(name:string,args:Record<string,unknown>):Promise<unknown>;
  enqueue(jobId:string):Promise<boolean>;
  story():{data:{tts_mode:string}|null;error:null};
}
const globals=globalThis as unknown as {__inkquestGenerationApiFixture:ApiFixture};
const root=join(dirname(fileURLToPath(import.meta.url)),"../../..");
async function route(branch:boolean){
  const modules:Record<string,string>={
    "@/lib/dal":"export const getUser=()=>globalThis.__inkquestGenerationApiFixture.getUser();",
    "@/lib/supabase/admin":"export const createAdminClient=()=>({rpc:(name,args)=>globalThis.__inkquestGenerationApiFixture.rpc(name,args)});",
    "@/lib/generation/queue":"export const enqueueGenerationJob=id=>globalThis.__inkquestGenerationApiFixture.enqueue(id);",
    "@/lib/supabase/server":"export const createClient=async()=>({from:()=>({select(){return this},eq(){return this},maybeSingle(){return globalThis.__inkquestGenerationApiFixture.story()}})});",
  };
  const result=await build({entryPoints:[join(root,branch?"src/app/api/generated-stories/[id]/choices/[choiceId]/route.ts":"src/app/api/generated-stories/route.ts")],
    bundle:true,platform:"node",format:"esm",write:false,plugins:[{name:"isolated-route-dependencies",setup(b){
      b.onResolve({filter:/^@\//},args=>args.path in modules?{path:args.path,namespace:"fixture"}:{path:join(root,"src",args.path.slice(2)+".ts")});
      b.onLoad({filter:/.*/,namespace:"fixture"},args=>({contents:modules[args.path],loader:"js"}));
    }}]});
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
}
for(const branch of [false,true]){
  for(const mode of ["missing-rpc","paused","reused","fresh","unauthorized","transport-unknown"]){
    test(`${branch?"branch":"opening"} actual POST route: ${mode}`,async t=>{
      const calls:string[]=[];let enqueued=0;
      if(mode==="transport-unknown")t.mock.method(console,"error",()=>{});
      globals.__inkquestGenerationApiFixture={
        async getUser(){return mode==="unauthorized"?null:{id:"fixture-user"};},
        async rpc(name){calls.push(name);
          if(mode==="transport-unknown")throw new Error("fixture unknown transaction outcome");
          if(mode==="missing-rpc")return {data:null,error:{code:"PGRST202",message:"fixture missing RPC"}};
          if(mode==="paused")return {data:null,error:{code:"P0001",message:"generation_backend_unavailable"}};
          return {data:[{story_id:"fixture-story",job_id:"fixture-job",reservation_id:"fixture-reservation",reused:mode==="reused"}],error:null};
        },async enqueue(){enqueued++;return true;},story(){return {data:{tts_mode:"off"},error:null};},
      };
      t.after(()=>{delete (globals as Partial<typeof globals>).__inkquestGenerationApiFixture;});
      const {POST}=await route(branch);
      const request=new Request("https://inkquest.invalid/api/generated-stories",{method:"POST",headers:{"idempotency-key":"fixture-idempotency","content-type":"application/json"},
        body:JSON.stringify({targetLanguage:"en",learnerLevel:"B1",premise:"A quiet library",ttsMode:"off",setup:{}})});
      const response=await POST(request,{params:Promise.resolve({id:"fixture-story",choiceId:"fixture-choice"})});
      const body=await response.json();
      if(mode==="unauthorized"){assert.equal(response.status,401);assert.equal(calls.length,0);}
      else{
        assert.deepEqual(calls,[branch?"create_ready_story_branch_job":"create_ready_generated_story_job"]);
        if(mode==="transport-unknown"){
          assert.equal(response.status,503);assert.equal(body.error,branch?"branch_creation_unavailable":"story_creation_unavailable");
        }else if(mode==="missing-rpc"||mode==="paused"){
          assert.equal(response.status,503);assert.equal(body.error,"generation_backend_unavailable");
          assert.equal(body.job_id,undefined);assert.match(response.headers.get("cache-control")??"",/no-store/);
        }else{
          assert.equal(response.status,mode==="reused"?200:202);assert.equal(body.job_id,"fixture-job");assert.equal(body.dispatchQueued,mode==="fresh");
        }
      }
      assert.equal(enqueued,mode==="fresh"?1:0);
    });
  }
}
