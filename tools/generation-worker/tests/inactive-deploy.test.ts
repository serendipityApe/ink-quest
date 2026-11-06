import assert from "node:assert/strict";
import {test} from "node:test";
import {deployInactive,ACCOUNT,WORKER} from "../deploy_inactive.mjs";
function fixture(denySecret=false){
 const calls:string[]=[];
 return {calls,run:()=>deployInactive({token:"fixture-cf-token",serviceRole:"fixture-service-secret",read:async()=>Buffer.from("fixture"),request:async(url,options)=>{
  const path=new URL(String(url)).pathname.replace(`/client/v4/accounts/${ACCOUNT}`,"");calls.push(`${options.method} ${path}`);
  assert.equal(options.redirect,"manual");assert.ok(!/queues|messages|recovery|subscriptions|tokens/.test(path));
  let result:any={};
  if(path==="/workers/scripts")result=[];
  else if(options.body instanceof FormData){
   const metadata=JSON.parse(await options.body.get("metadata").text());
   assert.deepEqual(metadata.bindings.map((b:any)=>b.type),["plain_text","plain_text","plain_text"]);
   assert.equal(metadata.bindings[0].text,"false");assert.equal(metadata.limits,undefined);
   assert.ok(!JSON.stringify(metadata).includes("fixture-service-secret"));result={deployment_id:"fixture-version",startup_time_ms:366};
  }else if(path.endsWith("/subdomain"))result={enabled:false,previews_enabled:false};
  else if(path.endsWith("/secrets")){
   const body=JSON.parse(String(options.body));assert.equal(body.name,"SUPABASE_SERVICE_ROLE_KEY");assert.equal(body.text,"fixture-service-secret");
   if(denySecret)return Response.json({success:false,errors:[{code:10000,message:"Never output raw secret error"}]},{status:403});
  }else if(path.endsWith("/settings"))result={bindings:[{name:"GENERATION_ENABLED",type:"plain_text",text:"false"},{name:"SUPABASE_SERVICE_ROLE_KEY",type:"secret_text"}]};
  else if(path.endsWith("/schedules"))result={schedules:[]};
  else assert.fail(`Unexpected endpoint ${path}`);
  return Response.json({success:true,result});
 }})};
}
test("inactive production deploy transfers only approved Supabase secret to exact Worker and attaches no consumers",async()=>{
 const f=fixture(),r=await f.run();assert.equal(r.stopped?.action,"disabled_worker_and_approved_supabase_secret_configured");
 assert.equal(r.supabaseSecretConfigured,true);assert.equal(r.generationEnabled,false);assert.equal(r.queueBindings,0);
 assert.ok(f.calls.filter(c=>!c.endsWith("/workers/scripts")).every(c=>c.includes(WORKER)));
 assert.ok(!JSON.stringify(r).includes("fixture-service-secret"));assert.ok(!JSON.stringify(r).includes("fixture-cf-token"));
});
test("inactive production deploy stops at actual secret-write denial with disabled Worker already uploaded",async()=>{
 const f=fixture(true),r=await f.run();assert.equal(r.stopped?.action,"configure_approved_supabase_secret");
 assert.equal(r.stopped?.denied,true);assert.equal(r.supabaseSecretConfigured,false);assert.ok(f.calls.at(-1)?.endsWith("/secrets"));
 assert.ok(!JSON.stringify(r).includes("Never output"));
});
