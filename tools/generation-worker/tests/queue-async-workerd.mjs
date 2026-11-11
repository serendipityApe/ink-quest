import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {dirname,join} from "node:path";
import {fileURLToPath} from "node:url";
import {Miniflare} from "miniflare";
import {isolatedDatabase} from "./database.mjs";
import {postgrestResponse} from "./postgrest.mjs";
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const db=await isolatedDatabase({includeAssets:true});
const rpc=async(name,args)=>{
  const entries=Object.entries(args);
  return (await db.query(`select public.${name}(${entries.map(([k],i)=>`${k}=>$${i+1}`).join(",")}) result`,entries.map(([,v])=>v))).rows[0].result;
};
const userId=crypto.randomUUID();
await db.query("insert into auth.users(id) values($1)",[userId]);
await rpc("grant_credits",{p_user_id:userId,p_amount:1000,p_source_type:"test",p_source_id:userId,p_idempotency_key:`grant:${userId}`});
await db.exec(`insert into public.generation_dictionary_versions values('fixture-v1',true,2,'[]',now());
  insert into public.generation_dictionary_entries values('fixture-v1','en','library','/laɪbrəri/','["图书馆"]','B1'),
    ('fixture-v1','zh','图书馆',null,'["library"]','HSK 3');`);
let databaseCalls=0;
const mf=new Miniflare({cf:false,workers:[
  {name:"generation",modulesRoot:join(root,"dist"),modules:[{type:"ESModule",path:join(root,"dist/worker.js")},
    {type:"CompiledWasm",path:join(root,"dist/jieba.wasm")}],compatibilityDate:"2026-07-21",outboundService:"external-fixture",
    bindings:{GENERATION_ENABLED:"true",GENERATION_ASYNC_DICTIONARY:"true",GENERATION_SINGLE_CALL_OPENING:"true",SUPABASE_URL:"https://database.invalid",SUPABASE_SERVICE_ROLE_KEY:"fixture-key",
      GENERATION_DICTIONARY_VERSION:"fixture-v1",LLM_PROVIDER:"openai",OPENAI_API_KEY:"fixture-key",OPENAI_MODEL:"mock-v1",
      AZURE_SPEECH_KEY:"fixture-key",AZURE_SPEECH_REGION:"fixture",AZURE_TTS_VOICE_EN:"mock-complete"},
    queueProducers:{GENERATION_QUEUE:"isolated-generation"},queueConsumers:{"isolated-generation":{maxBatchSize:1,maxBatchTimeout:0,maxRetries:3}}},
  {name:"external-fixture",modules:true,script:await readFile(join(root,"tests/mock-speech.js"),"utf8"),compatibilityDate:"2026-07-21",
    serviceBindings:{DATABASE:async request=>{
      databaseCalls++;const path=new URL(request.url).pathname;
      if(path.startsWith("/storage/v1/object/"))return new Response("{}",{status:200});
      assert.ok(path.startsWith("/rest/v1/rpc/"));
      try{const name=path.split("/").at(-1);
        if(name==='enrichment_begin_stage'){
          const args=await request.clone().json();
          const rows=(await db.query("select n.id,j.stage from public.story_nodes n join public.generation_jobs j on j.id=n.created_by_job_id where j.id=$1",[args.p_job_id])).rows;
          assert.equal(rows.length,1,'dictionary model work starts only after atomic text commit');
        }
        return postgrestResponse(name,await rpc(name,await request.json()));}
      catch(error){console.error("Local SQL RPC failure:",path.split("/").at(-1),error.message);return Response.json({error:"fixture database error"},{status:503});}
    }},outboundService:()=>{throw new Error("External network disabled");}},
]});
try{
  const queue=await mf.getQueueProducer("GENERATION_QUEUE","generation");
  for(const tts of [false,true]){
    const created=await db.query(`select * from public.create_generated_story_job($1,'en','B1','A quiet library',$2,$3,'fixture',$4,$5,'{}')`,[
      userId,tts?"every_scene":"off",tts?25:20,`request:${crypto.randomUUID()}`,
      [{code:"scene_text",credits:20},...(tts?[{code:"scene_tts",credits:5}]:[])],
    ]);
    const jobId=created.rows[0].job_id;
    // Deliberately duplicate the initial message. All stages use the actual
    // production bundle, local Queues, real SQL RPCs and synthetic providers.
    await queue.send({jobId});await queue.send({jobId});
    const deadline=Date.now()+15_000;let status;
    do{
      status=(await db.query("select status from public.generation_jobs where id=$1",[jobId])).rows[0].status;
      if(["completed","partial_success","failed"].includes(status))break;
      await new Promise(resolve=>setTimeout(resolve,20));
    }while(Date.now()<deadline);
    assert.equal(status,"completed",`isolated queue job, TTS=${tts}`);
    const nodeCount=(await db.query("select count(*)::integer n from public.story_nodes where created_by_job_id=$1",[jobId])).rows[0].n;
    assert.equal(nodeCount,1);
    const enrichmentDeadline=Date.now()+15_000;let enrichment;
    do {
      enrichment=(await db.query("select status from public.generation_enrichment_jobs where job_id=$1",[jobId])).rows[0]?.status;
      if(['completed','failed','stale'].includes(enrichment))break;
      await new Promise(resolve=>setTimeout(resolve,20));
    }while(Date.now()<enrichmentDeadline);
    assert.equal(enrichment,'completed','independent dictionary task completes');
    const node=(await db.query("select text_segments,model_metadata from public.story_nodes where created_by_job_id=$1",[jobId])).rows[0];
    assert.equal(node.model_metadata.enrichmentStatus,'completed');
    assert.ok(node.text_segments.every(token=>token.tier==='base'||token.meaning));
  }
  const account=(await db.query("select available,reserved from public.credit_accounts where user_id=$1",[userId])).rows[0];
  assert.deepEqual(account,{available:955,reserved:0});
  const external=await mf.getWorker("external-fixture");const stats=await (await external.fetch("http://fixture.invalid/stats")).json();
  assert.deepEqual(stats,{plan:0,write:0,gloss:2,audio:1,opening:2});
  console.log(JSON.stringify({result:"passed",runtime:"text-first local workerd Queues + isolated PostgreSQL",jobs:2,
    initialDuplicateDeliveries:2,providerCalls:stats,databaseCalls,account,externalNetworkCalls:0,productionMessages:0}));
}finally{await mf.dispose();await db.close();}
