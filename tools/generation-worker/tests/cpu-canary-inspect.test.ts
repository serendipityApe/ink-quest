import assert from "node:assert/strict";
import {test} from "node:test";
test("existing-canary inspection only reads fixed isolated resources and joins platform fields",async()=>{
  const originalFetch=globalThis.fetch,originalLog=console.log,oldExit=process.exitCode;
  const oldToken=process.env.CLOUDFLARE_API_TOKEN,oldAccount=process.env.CLOUDFLARE_ACCOUNT_ID,oldSummary=process.env.GITHUB_STEP_SUMMARY;
  const calls:string[]=[],output:string[]=[];
  try{
    process.env.CLOUDFLARE_API_TOKEN="fixture-token";process.env.CLOUDFLARE_ACCOUNT_ID="fdfece8b5c135c21fa630440b8dbf2e4";
    delete process.env.GITHUB_STEP_SUMMARY;console.log=(value)=>{output.push(String(value));};
    globalThis.fetch=async(url,options)=>{
      const path=new URL(String(url)).pathname;calls.push(path);
      const telemetry=path.includes("/telemetry/");assert.equal(options?.method,telemetry?"POST":"GET");
      let result:any={};
      if(path.endsWith("/keys"))result=[{key:"$workers.cpuTimeMs",type:"number"}];
      else if(path.endsWith("/query")){
        const body=JSON.parse(String(options?.body));assert.equal(body.parameters.filters[0].value,"inkquest-generation-cpu-canary");
        result={events:[{$workers:{scriptName:"inkquest-generation-cpu-canary",eventType:"queue",requestId:"fixture-request",cpuTimeMs:2,outcome:"ok"},
          source:{event:"generation_cpu_canary",caseId:"zh-short",tokens:26,networkCalls:0}}]};
      }
      return Response.json({success:true,result});
    };
    await import(`../inspect_cpu_canary.mjs?fixture=${Date.now()}`);
    assert.equal(calls.length,6);assert.ok(!calls.some(path=>/messages|subscriptions|secrets|tokens|entitlements/.test(path)));
    const report=JSON.parse(output[0]);assert.equal(report.mutations,0);assert.equal(report.messagesSent,0);
    assert.equal(report.events[0].cpuTimeMs,2);assert.equal(report.events[0].fixture.caseId,"zh-short");
    assert.ok(!output.join("").includes("fixture-token"));
  }finally{
    globalThis.fetch=originalFetch;console.log=originalLog;process.exitCode=oldExit;
    for(const [key,value] of Object.entries({CLOUDFLARE_API_TOKEN:oldToken,CLOUDFLARE_ACCOUNT_ID:oldAccount,GITHUB_STEP_SUMMARY:oldSummary}))
      if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
});
