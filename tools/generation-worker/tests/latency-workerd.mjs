import assert from 'node:assert/strict';
import {mkdtemp,copyFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import {CASES,checkSample} from '../verify_latency_canary.mjs';
import {VERSION,SOURCE,MANIFEST} from '../activation_checks.mjs';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const out=await mkdtemp(join(tmpdir(),'inkquest-latency-runtime-'));
await build({stdin:{contents:`import canary from './src/asset-rpc-canary.ts';export default {async fetch(request,env){const logs=[];const original=console.log;console.log=line=>logs.push(JSON.parse(line));try{await canary.queue({messages:[{body:await request.json(),ack(){}}]},env);}finally{console.log=original;}return Response.json(logs.find(x=>x.event==='dictionary_asset_canary'));}};`,resolveDir:root,sourcefile:'test-only-latency.ts'},outfile:join(out,'worker.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',inject:[join(root,'src/speech-websocket.ts')],define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'wasm',setup(b){b.onResolve({filter:/\.wasm$/},()=>({path:'./jieba.wasm',external:true}));}}]});
await copyFile(join(root,'vendor/jieba-wasm/jieba_rs_wasm_bg.wasm'),join(out,'jieba.wasm'));
const mf=new Miniflare({workers:[
 {name:'canary',modulesRoot:out,modules:[{type:'ESModule',path:join(out,'worker.js')},{type:'CompiledWasm',path:join(out,'jieba.wasm')}],compatibilityDate:'2026-07-21',bindings:{GENERATION_DICTIONARY_VERSION:VERSION,GENERATION_DICTIONARY_SOURCE_VERSION:SOURCE,GENERATION_DICTIONARY_MANIFEST_SHA256:MANIFEST},serviceBindings:{DICTIONARY:{name:'dictionary',entrypoint:'Dictionary'}},outboundService:()=>{throw Error('external_network_prohibited');}},
 {name:'dictionary',modules:true,compatibilityDate:'2026-07-21',script:`import {WorkerEntrypoint} from 'cloudflare:workers';export class Dictionary extends WorkerEntrypoint {async lookup(language,words,version){if(version!==${JSON.stringify(VERSION)})return {ok:false,reason:'integrity'};if(words.length>4)throw Error('bound');return {ok:true,batch:{version,sourceVersion:${JSON.stringify(SOURCE)},manifestSha256:${JSON.stringify(MANIFEST)},ready:true,entries:words.map(word=>({word,reading:null,candidates:["fixture meaning"],level:null}))}};}}export default {fetch(){return new Response('not_found',{status:404});}};`,outboundService:()=>{throw Error('external_network_prohibited');}}
]});
try{for(const caseId of CASES){const r=await mf.dispatchFetch('http://fixture.invalid',{method:'POST',body:JSON.stringify({caseId})});assert.equal(r.status,200);const fixture=await r.json();checkSample({outcome:'ok',cpuMs:0,fixture},caseId);console.log(JSON.stringify({caseId,verified:fixture.verified,rpcCalls:fixture.rpcCalls,lookupWords:fixture.lookupWords,maxConcurrentReads:fixture.maxConcurrentReads}));}console.log(JSON.stringify({result:'passed',cases:CASES.length,externalNetworkCalls:0,modelCalls:0,databaseCalls:0,cpu:'not measured; local runtime validation only'}));}finally{await mf.dispose();await rm(out,{recursive:true,force:true});}
