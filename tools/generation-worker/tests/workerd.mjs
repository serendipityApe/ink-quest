import assert from "node:assert/strict";
import {build} from "esbuild";
import {Miniflare} from "miniflare";
import {mkdtemp,copyFile,readFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {fileURLToPath} from "node:url";
import {dirname,join} from "node:path";
import {createRequire} from "node:module";
const require=createRequire(new URL("../../story-pipeline/package.json",import.meta.url));
const {Jieba}=require("@node-rs/jieba");
const {dict}=require("@node-rs/jieba/dict.js");
const native=Jieba.withDict(dict);
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const out=await mkdtemp(join(tmpdir(),"inkquest-workerd-"));
await build({entryPoints:[join(root,"tests/runtime-entry.ts")],outfile:join(out,"worker.js"),bundle:true,format:"esm",platform:"browser",target:"es2022",
  inject:[join(root,"src/speech-websocket.ts")],define:{"process.env.NODE_ENV":'"production"'},
  plugins:[{name:"wasm",setup(b){b.onResolve({filter:/\.wasm$/},()=>({path:"./jieba.wasm",external:true}));}}]});
await copyFile(join(root,"vendor/jieba-wasm/jieba_rs_wasm_bg.wasm"),join(out,"jieba.wasm"));
const mf=new Miniflare({workers:[
  {name:"generation",modulesRoot:out,modules:[{type:"ESModule",path:join(out,"worker.js")},{type:"CompiledWasm",path:join(out,"jieba.wasm")}],compatibilityDate:"2026-07-21",outboundService:"external-fixture"},
  {name:"external-fixture",modules:true,script:await readFile(join(root,"tests/mock-speech.js"),"utf8"),compatibilityDate:"2026-07-21",
    outboundService:()=>{throw new Error("Network disabled for runtime tests");}},
]});
const request=async body=>{const response=await mf.dispatchFetch("http://isolated.invalid",{method:"POST",body:JSON.stringify(body)});return {status:response.status,body:await response.json()};};
try{
  assert.deepEqual((await request({mode:"disabled"})).body,{acks:0,retries:1});
  const text="小明今天来到图书馆，认真寻找一本关于宇宙的书。管理员微笑着告诉他，探索未知需要勇气和耐心。";
  const segmented=await request({mode:"segment",text});assert.equal(segmented.status,200);
  assert.equal(segmented.body.words.join(""),text);assert.ok(segmented.body.words.includes("图书馆"));
  assert.ok(segmented.body.wasmMemoryBytes<128*1024*1024);
  const parityCases=[text,"南京市长江大桥","研究生命的起源","他来到了网易杭研大厦","我来到北京清华大学",
    "小明硕士毕业于中国科学院计算所，后在日本京都大学深造。","小王在2026年买了3本书，价格是29.5元。",
    "乒乓球拍卖完了。","这个世界需要勇气、耐心和一点点想象力。","OpenAI与InkQuest一起探索未知。",
    "林沐曦和陈星澜走进了青石巷。",text.repeat(10)];
  const elapsed=[];
  for(const sentence of parityCases){
    const result=await request({mode:"segment",text:sentence});assert.equal(result.status,200);
    assert.deepEqual(result.body.words,native.cut(sentence,true),`Native/WASM segmentation: ${sentence.slice(0,40)}`);
    elapsed.push(result.body.elapsedMs);
  }
  const zh=await request({mode:"enrich",lang:"zh",text:"图书馆"});assert.equal(zh.status,200);
  assert.deepEqual(zh.body.tokens[0],{word:"图书馆",tier:"normal",candidates:["library"],reading:"tú shū guǎn",level:"HSK 3",meaning:"library"});
  const en=await request({mode:"enrich",lang:"en",text:"the library"});assert.equal(en.status,200);
  assert.equal(en.body.tokens[0].tier,"base");assert.equal(en.body.tokens[1].reading,"/laɪbrəri/");assert.equal(en.body.tokens[1].level,"B1");assert.equal(en.body.tokens[1].meaning,"图书馆");
  assert.equal((await request({mode:"enrich",lang:"en",text:"library",missing:true})).status,422);
  const audio=await request({mode:"audio"});assert.equal(audio.status,200,JSON.stringify(audio.body));
  assert.ok(audio.body.bytes>0);assert.equal(audio.body.timings.length,3);assert.equal(audio.body.durationMs,300);
  const missing=await request({mode:"audio",missing:true});assert.equal(missing.status,422);assert.match(missing.body.error,/no word boundary/);
  console.log(JSON.stringify({runtime:"local workerd",checks:["disabled queue","WASM segmentation","Chinese reading/meaning/HSK","English reading/meaning/CEFR","missing dictionary fails","real Speech SDK with local WebSocket protocol","missing boundary fails"],
    nativeParityCases:parityCases.length,wasmMemoryBytes:segmented.body.wasmMemoryBytes,
    localElapsedMs:elapsed,externalCalls:0,productionQueueMessages:0}));
}finally{await mf.dispose();await rm(out,{recursive:true,force:true});}
