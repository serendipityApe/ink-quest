import {test} from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Standalone CI guard intentionally uses plain JavaScript.
import {checkBindings,checkConsumer,checkSample,checkContinuation,telemetry,WORKER} from '../verify_latency_canary.mjs';
// @ts-expect-error Existing deployment constants use plain JavaScript.
import {VERSION,SOURCE,MANIFEST,READER} from '../activation_checks.mjs';
const bindings=[{name:'DICTIONARY',type:'service',service:READER,entrypoint:'Dictionary'},...Object.entries({GENERATION_DICTIONARY_VERSION:VERSION,GENERATION_DICTIONARY_SOURCE_VERSION:SOURCE,GENERATION_DICTIONARY_MANIFEST_SHA256:MANIFEST}).map(([name,text])=>({name,type:'plain_text',text}))];
test('isolated bindings and consumer fail closed',()=>{checkBindings(bindings);assert.throws(()=>checkBindings([...bindings,{name:'OPENAI_API_KEY',type:'secret_text'}]));assert.throws(()=>checkBindings([{...bindings[0],service:'inkquest-generation-worker'},...bindings.slice(1)]));const c={script_name:WORKER,settings:{batch_size:1,max_concurrency:1,max_retries:0}};checkConsumer([c]);assert.throws(()=>checkConsumer([{...c,settings:{...c.settings,max_retries:1}}]));});
test('candidate telemetry and CPU checks fail closed',()=>{const event={$workers:{scriptName:WORKER,scriptVersion:{id:'candidate'},requestId:'r',cpuTimeMs:8,outcome:'ok'},source:{event:'dictionary_asset_canary',caseId:'lookup-parallel-en',verified:true,modelCalls:0,databaseCalls:0,rpcCalls:5,lookupWords:16,maxConcurrentReads:4,checkpointBytes:500,wasmMemoryBytes:1000000,phase:'enrich'}};const rows=telemetry([event],WORKER,'candidate');assert.equal(rows.length,1);assert.equal(telemetry([event],WORKER,'old').length,0);checkSample(rows[0],'lookup-parallel-en');assert.throws(()=>checkSample({...rows[0],cpuMs:26},'lookup-parallel-en'));assert.throws(()=>checkSample({...rows[0],fixture:{...event.source,modelCalls:1}},'lookup-parallel-en'));});

test('telemetry joins separate log events without version to versioned CPU by request ID only',()=>{
 const fixture={event:'dictionary_asset_canary',caseId:'lookup-en',verified:true};
 const cpu={$workers:{scriptName:WORKER,scriptVersion:{id:'candidate'},cpuTimeMs:4,outcome:'ok'},$metadata:{requestId:'joined'}};
 const log={$workers:{scriptName:WORKER},$metadata:{requestId:'joined'},source:fixture};
 assert.deepEqual(telemetry([log,cpu],WORKER,'candidate')[0].fixture,fixture);
 assert.equal(telemetry([log,cpu],WORKER,'old').length,0);
 const unrelated={...log,$metadata:{requestId:'other'}};assert.equal(telemetry([unrelated,cpu],WORKER,'candidate')[0].fixture,undefined);
});

test('Queue regression guard differs from unchanged reader guard and continuation never repeats prior fixtures',()=>{
 const make=(caseId,cpuMs,rpcCalls,lookupWords,maxConcurrentReads)=>({outcome:'ok',cpuMs,fixture:{caseId,verified:true,modelCalls:0,databaseCalls:0,rpcCalls,lookupWords,maxConcurrentReads,checkpointBytes:500,wasmMemoryBytes:1000000,phase:'enrich'}});
 const prior=[make('lookup-parallel-zh',4,5,16,4),make('lookup-parallel-en',3,5,16,4),make('lookup-distinct',11,2,4,1)];
 const remaining=checkContinuation(prior);assert.equal(remaining.length,9);assert.ok(remaining.every(id=>!prior.some(x=>x.fixture.caseId===id)));
 assert.throws(()=>checkContinuation(prior.slice(1)));assert.throws(()=>checkContinuation([...prior,prior[0]]));assert.throws(()=>checkContinuation([...prior.slice(0,2),{...prior[2],cpuMs:26}]));
});
