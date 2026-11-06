import assert from "node:assert/strict";
import {test} from "node:test";
import {auditCloudflare,ACCOUNT} from "../audit_cloudflare.mjs";
test("control-plane audit uses only fixed-account GET and stops at first permission denial",async()=>{
  const calls:string[]=[];
  const report=await auditCloudflare({token:"fixture-token",request:async(url,options)=>{
    calls.push(String(url));assert.equal(options?.method,"GET");assert.equal(options?.redirect,"manual");
    assert.ok(String(url).startsWith(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/`));
    if(String(url).includes("/queues?"))return Response.json({success:true,result:[],result_info:{total_pages:1}});
    return Response.json({success:false,errors:[{code:10000,message:"Do not output this raw response"}]},{status:403});
  }});
  assert.equal(calls.length,2);assert.equal(report.stopped?.denied,true);assert.equal(report.mutations,0);assert.equal(report.canaryAllowed,false);
  assert.ok(!JSON.stringify(report).includes("fixture-token"));assert.ok(!JSON.stringify(report).includes("Do not output"));
});
test("control-plane audit refuses an unapproved account before reading the credential",async()=>{
  let calls=0;const report=await auditCloudflare({account:"different-account",token:"fixture",request:async()=>{calls++;throw new Error("Unexpected request");}});
  assert.equal(calls,0);assert.equal(report.stopped?.reason,"unexpected_account");assert.equal(report.canaryAllowed,false);
});
