import assert from "node:assert/strict";
import {test} from "node:test";
import {extractCanaryTelemetry} from "../canary_telemetry.mjs";
const WORKER="inkquest-generation-cpu-canary",VERSION="15257c85-76e5-46a8-8029-2ad7d3e0be84";
function events(caseId="zh-short",id="fixture-request",cpu=3){
  const w={scriptName:WORKER,eventType:"queue",scriptVersion:{id:VERSION}};
  return [{$metadata:{requestId:id},$workers:{...w,cpuTimeMs:cpu,wallTimeMs:4,outcome:"ok"}},
    {$metadata:{requestId:id},$workers:w,source:{event:"generation_cpu_canary",caseId,tokens:26,wasmMemoryBytes:61734912,networkCalls:0}}];
}
test("Cloudflare CPU joins separate events using metadata request ID and rejects unrelated logs",()=>{
  const result={events:{events:events()}};
  const actual=extractCanaryTelemetry(result,WORKER);
  assert.equal(actual.samples.length,1);assert.equal(actual.samples[0].cpuTimeMs,3);assert.equal(actual.samples[0].caseId,"zh-short");
  result.events.events[1].$metadata.requestId="another-request";
  assert.equal(extractCanaryTelemetry(result,WORKER).samples.length,0);
  assert.equal(extractCanaryTelemetry(result,"another-worker").invocations.length,0);
});
test("continuation verifies existing version and first CPU, sends only remaining fixtures, and never redeploys",async()=>{
  const originalFetch=globalThis.fetch,originalLog=console.log,oldTimer=globalThis.setTimeout,oldExit=process.exitCode;
  const oldToken=process.env.CLOUDFLARE_API_TOKEN,oldAccount=process.env.CLOUDFLARE_ACCOUNT_ID,oldSummary=process.env.GITHUB_STEP_SUMMARY;
  const calls:Array<{path:string;body:any}>=[],output:string[]=[],logs=events();
  try{
    process.env.CLOUDFLARE_API_TOKEN="fixture-token";process.env.CLOUDFLARE_ACCOUNT_ID="fdfece8b5c135c21fa630440b8dbf2e4";
    delete process.env.GITHUB_STEP_SUMMARY;console.log=v=>{output.push(String(v));};
    globalThis.setTimeout=((callback:any)=>{callback();return 0;}) as any;
    globalThis.fetch=async(url,options)=>{
      const path=new URL(String(url)).pathname,body=options?.body?JSON.parse(String(options.body)):null;calls.push({path,body});
      assert.ok(!/subscriptions|secrets|tokens|entitlements/.test(path));
      assert.equal(options?.method,body?"POST":"GET");
      let result:any;
      const consumer={script_name:WORKER,settings:{batch_size:1,max_concurrency:1,max_retries:0}};
      if(path.endsWith("/consumers"))result=[consumer];
      else if(path.endsWith("/subdomain"))result={enabled:false,previews_enabled:false};
      else if(path.endsWith("/settings"))result={bindings:[]};
      else if(path.endsWith("/deployments"))result={deployments:[{versions:[{version_id:VERSION,percentage:100}]}]};
      else if(path.endsWith("/query"))result={events:{events:logs}};
      else if(path.endsWith("/messages")){logs.push(...events(body.body.caseId,`fixture-${calls.length}`,5));result={};}
      else if(path.endsWith("/metrics"))result={backlog_count:0};
      else result={queue_name:"inkquest-generation-cpu-canary-20261106",consumers_total_count:1};
      return Response.json({success:true,result});
    };
    await import(`../continue_cpu_canary.mjs?fixture=${Date.now()}`);
    const report=JSON.parse(output[0]);assert.equal(report.stopped.action,"six_sample_experiment_complete");
    const sends=calls.filter(c=>c.path.endsWith("/messages"));assert.equal(sends.length,5);
    assert.deepEqual(sends.map(c=>c.body.body.caseId),["zh-paragraph","zh-long","en-short","en-paragraph","en-long"]);
    assert.equal(report.samples.length,6);assert.equal(report.totalExperimentMessagesAccepted,6);
    assert.ok(!output.join("").includes("fixture-token"));
  }finally{
    globalThis.fetch=originalFetch;console.log=originalLog;globalThis.setTimeout=oldTimer;process.exitCode=oldExit;
    for(const [key,value] of Object.entries({CLOUDFLARE_API_TOKEN:oldToken,CLOUDFLARE_ACCOUNT_ID:oldAccount,GITHUB_STEP_SUMMARY:oldSummary}))
      if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
});
