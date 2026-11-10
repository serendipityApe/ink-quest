// Offline full-asset verification, hostile-input regression and CPU upper estimate.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {AssetDictionary,bucket} from './reader.mjs';
const root=process.argv[2];assert.ok(root);
const build=JSON.parse(await readFile(root+'/build-report.json','utf8'));
const dir=root+'/'+build.version,manifest=JSON.parse(await readFile(root+'/audit-manifest.json','utf8'));
const runtimeManifest=JSON.parse(await readFile(dir+'/manifest.json','utf8'));
const catalog=await readFile(dir+'/catalog.bin');
assert.equal(catalog.length,655360);assert.equal(createHash('sha256').update(catalog).digest('hex'),runtimeManifest.catalogSha256);
let counts={zh:0,en:0};const fixture={zh:[],en:[]};
for(const [name,meta] of Object.entries(manifest.files)){
 const offset=((name.startsWith('en/')?8192:0)+parseInt(name.slice(3,7),16))*40;
 assert.equal(catalog.subarray(offset,offset+32).toString('hex'),meta.sha256);assert.equal(catalog.readUInt32LE(offset+32),meta.bytes);assert.equal(catalog.readUInt32LE(offset+36),meta.rows);
 const body=await readFile(dir+'/'+name);assert.equal(body.length,meta.bytes);assert.equal(createHash('sha256').update(body).digest('hex'),meta.sha256);
 const data=JSON.parse(body);assert.equal(Object.keys(data).length,meta.rows);
 for(const word of Object.keys(data)){assert.equal(bucket(word),parseInt(name.slice(3,7),16));counts[name.slice(0,2)]++;}
 const key=Object.keys(data)[0];if(key&&fixture[name.slice(0,2)].length<48)fixture[name.slice(0,2)].push(key);
}
assert.deepEqual(counts,{zh:121446,en:770611});
let calls=0,bytes=0;
const assets={async fetch(req){calls++;const data=await readFile(root+new URL(req.url).pathname);bytes+=data.length;return new Response(data);}};
const reader=new AssetDictionary(assets,build.version,build.manifestSha256);
await assert.rejects(()=>reader.lookup('en',['x'],'wrong'));
await assert.rejects(()=>reader.lookup('en',Array(49).fill('x'),build.version));
const corrupt=new AssetDictionary({async fetch(){return new Response('{}');}},build.version,build.manifestSha256);
await assert.rejects(()=>corrupt.lookup('zh',[],build.version),/integrity/);
const missing=new AssetDictionary({async fetch(){return new Response('',{status:404});}},build.version,build.manifestSha256);
await assert.rejects(()=>missing.lookup('zh',[],build.version),/unavailable/);
const benchmarks=[];
for(const language of ['zh','en']){
 calls=0;bytes=0;const start=process.cpuUsage();const result=await reader.lookup(language,fixture[language],build.version);const used=process.cpuUsage(start);
 assert.equal(result.entries.length,48);assert.equal(result.ready,true);assert.ok(calls<=50);
 benchmarks.push({language,words:48,calls,bytes,cpuMs:(used.user+used.system)/1000});
}
assert.equal((await reader.lookup('en',['__proto__','constructor','not-a-real-word-0123456789'],build.version)).ready,true);
console.log(JSON.stringify({verifiedRows:counts,files:16384,benchmarks,note:'Node CPU includes local file I/O work; remote Free-plan validation is still required.'},null,2));
