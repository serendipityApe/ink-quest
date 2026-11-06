import assert from "node:assert/strict";
import {test} from "node:test";
import {runCanary,ACCOUNT,WORKER,QUEUE} from "../run_cpu_canary.mjs";
const ID="a".repeat(32);
function fixture(deny?:string,emptyCpu=false){
  const calls:Array<{path:string;method:string;body:any}>=[];let caseId="",sent=0;
  const request=async(url:any,options:any)=>{
    const path=new URL(url).pathname.replace(`/client/v4/accounts/${ACCOUNT}`,"");
    const body=options.body instanceof FormData?options.body:options.body?JSON.parse(options.body):null;
    calls.push({path,method:options.method,body});
    assert.equal(options.redirect,"manual");
    if(`${options.method} ${path}`===deny)return Response.json({success:false,errors:[{code:10000,message:"secret fixture"}]},{status:403});
    let result:any={};
    if(path==="/queues"&&options.method==="GET")result=[{queue_name:"inkquest-generation",consumers_total_count:0}];
    else if(path==="/workers/scripts")result=[];
    else if(path==="/queues"){assert.deepEqual(body,{queue_name:QUEUE});result={queue_id:ID};}
    else if(path===`/workers/scripts/${WORKER}`){
      const metadata=JSON.parse(await (body as FormData).get("metadata").text());
      assert.deepEqual(metadata.bindings,[]);assert.equal(metadata.limits,undefined);
      result={deployment_id:"fixture-version",startup_time_ms:27};
    }else if(path.endsWith("/subdomain")){assert.deepEqual(body,{enabled:false,previews_enabled:false});result=body;}
    else if(path.endsWith("/consumers"))result=body;
    else if(path.endsWith("/messages")){caseId=body.body.caseId;sent++;assert.equal(body.content_type,"json");}
    else if(path.endsWith("/query")){
      assert.equal(body.parameters.filters[0].value,WORKER);
      result={events:emptyCpu?[]:[{source:{message:JSON.stringify({event:"generation_cpu_canary",caseId,networkCalls:0})},
        $workers:{scriptName:WORKER,eventType:"queue",requestId:`fixture-${sent}`,cpuTimeMs:sent,wallTimeMs:sent+1,outcome:"ok",scriptVersion:{id:"fixture-version"}}}]};
    }else if(path.endsWith("/metrics"))result={backlog_count:0};
    else assert.fail(`Unexpected endpoint ${path}`);
    return Response.json({success:true,result,result_info:{total_pages:1}});
  };
  return {calls,run:()=>runCanary({token:"fixture-token",request,read:async()=>Buffer.from("fixture"),wait:async()=>{}})};
}
test("isolated canary stops after actual Queue create permission denial",async()=>{
  const f=fixture("POST /queues");
  const r=await f.run();assert.equal(r.stopped?.denied,true);assert.equal(f.calls.length,3);assert.equal(r.messagesAccepted,0);
  assert.equal(r.stopped?.action,"create_isolated_queue");assert.equal(f.calls.at(-1)?.method,"POST");
  assert.ok(!JSON.stringify(r).includes("secret fixture"));assert.ok(!JSON.stringify(r).includes("fixture-token"));
});
test("isolated canary leaves created queue idle on upload denial and sends no messages",async()=>{
  const f=fixture(`PUT /workers/scripts/${WORKER}`);const r=await f.run();
  assert.equal(r.stopped?.action,"upload_isolated_worker");assert.equal(r.stopped?.denied,true);
  assert.equal(r.queueId,ID);assert.equal(r.messagesAccepted,0);assert.equal(f.calls.at(-1)?.method,"PUT");
});
test("canary requires provider CPU joined to the fixed fixture before sending further messages",async()=>{
  const f=fixture(undefined,true);const r=await f.run();
  assert.equal(r.messagesAccepted,1);assert.equal(r.samples.length,0);
  assert.equal(r.stopped?.reason,"provider_cpu_not_observed_no_more_messages");
  assert.equal(f.calls.filter(c=>c.path.endsWith("/query")).length,8);
});
test("canary bounds all mutations to isolated resources and six sequential fixed messages",async()=>{
  const f=fixture();const r=await f.run();assert.equal(r.stopped?.action,"canary_complete");
  assert.equal(r.messagesAccepted,6);assert.equal(r.samples.length,6);assert.deepEqual(r.cpuSummaryMs,{median:3.5,p95:6,max:6,count:6});
  assert.equal(f.calls.filter(c=>c.path.endsWith("/messages")).length,6);
  assert.ok(f.calls.every(c=>c.method==="GET"||c.path==="/queues"||c.path.includes(WORKER)||c.path.includes(ID)||c.path.endsWith("/telemetry/query")));
  assert.ok(!f.calls.some(c=>/subscriptions|secrets|cron|schedules|tokens|entitlements/.test(c.path)));
});
