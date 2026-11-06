import assert from "node:assert/strict";
import {test} from "node:test";
import {requestLlmJson,requestPolicyFromEnv} from "../../story-pipeline/src/providers/llm/request.js";
import {LlmProviderError} from "../../story-pipeline/src/providers/llm/errors.js";

test("edge request policy validates and bounds attempts before any I/O",()=>{
  assert.deepEqual(requestPolicyFromEnv({LLM_REQUEST_TIMEOUT_MS:"75000",LLM_REQUEST_ATTEMPTS:"1"}),{timeoutMs:75000,attempts:1});
  assert.deepEqual(requestPolicyFromEnv({}),{timeoutMs:120000,attempts:3});
  for(const env of [{LLM_REQUEST_TIMEOUT_MS:"0"},{LLM_REQUEST_TIMEOUT_MS:"120001"},{LLM_REQUEST_ATTEMPTS:"4"},{LLM_REQUEST_ATTEMPTS:"NaN"}])
    assert.throws(()=>requestPolicyFromEnv(env),LlmProviderError);
});
for(const status of [302,401,429,500])test(`edge HTTP ${status} uses a single request and never follows redirects`,async t=>{
  let calls=0;t.mock.method(globalThis,"fetch",async(_url,request)=>{
    calls++;assert.equal(request.redirect,"manual");return Response.json({error:{code:"fixture"}},{status});
  });
  await assert.rejects(requestLlmJson("https://model.invalid",{headers:{},body:"{}"},x=>x,{timeoutMs:1000,attempts:1}),
    error=>error instanceof LlmProviderError&&error.safeToRetry===(status===429));
  assert.equal(calls,1);
});
test("transport timeouts are an unknown upstream outcome and are not automatically safe to replay",async t=>{
  t.mock.method(globalThis,"fetch",async()=>{throw new Error("fixture network termination");});
  await assert.rejects(requestLlmJson("https://model.invalid",{headers:{},body:"{}"},x=>x,{timeoutMs:1,attempts:1}),
    error=>error instanceof LlmProviderError&&error.safeToRetry===false);
});
