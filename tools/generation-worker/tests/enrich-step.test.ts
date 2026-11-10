import {test} from 'node:test';
import assert from 'node:assert/strict';
import {advanceEnrichment,LOOKUP_RPCS_PER_STEP,LOOKUP_WORDS_PER_RPC,PARALLEL_LOOKUP_MAX_SPANS} from '../src/enrich-step.js';
import {enrichSceneEdge,type DictionaryReader} from '../src/enrich.js';
const input={text:Array.from({length:45},(_,i)=>`word${i}`).join(' '),choices:[],targetLang:'en' as const,glossLang:'zh' as const};
test('persisted lexical steps preserve whole-scene result and bound each read',async()=>{
 let calls=0,max=0;
 const dictionary:DictionaryReader={async lookup(_lang,words,version){calls++;max=Math.max(max,words.length);return {version,ready:true,entries:words.map(word=>({word,reading:null,candidates:['meaning'],level:null}))};}};
 let progress;let result;let steps=0;
 do{const previous=calls;result=await advanceEnrichment(input,dictionary,'fixture',()=>[],progress);assert.ok(calls-previous<=LOOKUP_RPCS_PER_STEP);progress=result.progress?JSON.parse(JSON.stringify(result.progress)):undefined;steps++;}while(progress&&steps<20);
 assert.ok(result.enriched);assert.ok(max<=4);assert.ok(steps>3);assert.deepEqual(result.enriched,await enrichSceneEdge(input,dictionary,'fixture',()=>[]));
});
test('failed lookup leaves persisted progress unchanged for redelivery',async()=>{
 let initial=(await advanceEnrichment(input,{lookup:async()=>{throw Error();}},'v',()=>[])).progress!;
 while(initial.prepareCursor<input.text.trim().length)initial=(await advanceEnrichment(input,{lookup:async()=>{throw Error();}},'v',()=>[],initial)).progress!;
 const saved=JSON.stringify(initial);
 await assert.rejects(()=>advanceEnrichment(input,{async lookup(){throw Error('missing shard');}},'v',()=>[],initial),/missing shard/);
 assert.equal(JSON.stringify(initial),saved);
 await assert.rejects(()=>advanceEnrichment(input,{async lookup(){return {version:'wrong',ready:true,entries:[]};}},'v',()=>[],initial),/Invalid asset/);
 await assert.rejects(()=>advanceEnrichment({...input,text:'changed'}, {lookup:async()=>{throw Error();}},'v',()=>[],initial),/Invalid enrichment/);
});

test('preparation persists bounded chunks with exact word and whitespace parity',async()=>{
 const text=('The library is quiet. Alice finds a letter! '.repeat(70)).trim();
 const value={...input,text};let progress=(await advanceEnrichment(value,{} as DictionaryReader,'v',()=>[])).progress!;let steps=0;
 while(progress.prepareCursor<text.length){const saved=JSON.stringify(progress);const next=(await advanceEnrichment(value,{} as DictionaryReader,'v',()=>[],progress)).progress!;assert.equal(JSON.stringify(progress),saved);assert.ok(next.prepareCursor-progress.prepareCursor<=384);progress=JSON.parse(JSON.stringify(next));steps++;}
 assert.ok(steps>2);
 const {prepareEnrichmentSpans}=await import('../src/enrich.js');assert.deepEqual(progress.spans,prepareEnrichmentSpans(value,()=>[]));
 await assert.rejects(()=>advanceEnrichment({...input,text:'中'.repeat(500),targetLang:'zh'},{} as DictionaryReader,'v',()=>[],{...progress,input:JSON.stringify({...input,text:'中'.repeat(500),targetLang:'zh'}),prepareCursor:0,spans:[]}),/unbounded lexical/);
});


test('large checkpoints retain single-RPC bounds and exact output for 2000 distinct keys',async()=>{
 const value={...input,text:Array.from({length:2000},(_,i)=>'w'+String(i).padStart(4,'0')).join(' ')};
 let active=0,maxActive=0,calls=0;const batches:string[][]=[];
 const dictionary:DictionaryReader={async lookup(_lang,words,version){
  calls++;active++;maxActive=Math.max(maxActive,active);batches.push(words);
  await new Promise(resolve=>setTimeout(resolve,1));active--;
  return {version,ready:true,entries:words.map(word=>({word,reading:'/fixture/',candidates:['meaning'],level:null}))};
 }};
 let progress;let result;let deliveries=0;
 do {const before=calls;result=await advanceEnrichment(value,dictionary,'v',()=>[],progress);assert.ok(calls-before<=LOOKUP_RPCS_PER_STEP);progress=result.progress?JSON.parse(JSON.stringify(result.progress)):undefined;deliveries++;}while(progress&&deliveries<650);
 assert.ok(result.enriched);assert.equal(result.enriched.tokens.length,2000);
 assert.equal(maxActive,1);assert.ok(batches.every(words=>words.length<=LOOKUP_WORDS_PER_RPC));
 const expected=await enrichSceneEdge(value,{async lookup(_lang,words,version){return {version,ready:true,entries:words.map(word=>({word,reading:'/fixture/',candidates:['meaning'],level:null}))};}},'v',()=>[]);
 assert.deepEqual(result.enriched,expected);
});

test('partial parallel failure drains all reads and leaves checkpoint unchanged',async()=>{
 let progress=(await advanceEnrichment(input,{} as DictionaryReader,'v',()=>[])).progress!;
 while(progress.prepareCursor<input.text.length)progress=(await advanceEnrichment(input,{} as DictionaryReader,'v',()=>[],progress)).progress!;
 const saved=JSON.stringify(progress);let finished=0;
 await assert.rejects(advanceEnrichment(input,{async lookup(_lang,words,version){
  if(words[0]==='word0'){finished++;throw Error('missing shard');}
  await new Promise(resolve=>setTimeout(resolve,5));finished++;return {version,ready:true,entries:[]};
 }},'v',()=>[],progress),/missing shard/);
 assert.equal(finished,LOOKUP_RPCS_PER_STEP);assert.equal(JSON.stringify(progress),saved);
 const retried=await advanceEnrichment(input,{async lookup(_lang,_words,version){return {version,ready:true,entries:[]};}},'v',()=>[],progress);
 assert.equal(retried.progress!.resolved.length,16);
});

test('parallel batch rejects entries belonging to another group',async()=>{
 let progress=(await advanceEnrichment(input,{} as DictionaryReader,'v',()=>[])).progress!;
 while(progress.prepareCursor<input.text.length)progress=(await advanceEnrichment(input,{} as DictionaryReader,'v',()=>[],progress)).progress!;
 await assert.rejects(advanceEnrichment(input,{async lookup(_lang,words,version){return {version,ready:true,entries:[{word:words[0]==='word0'?'word4':'word0',reading:null,candidates:[],level:null}]};}},'v',()=>[],progress),/Invalid asset/);
});


test('out-of-order lookup responses preserve request order and final remainder',async()=>{
 const value={...input,text:Array.from({length:17},(_,i)=>`word${i}`).join(' ')};
 let progress=(await advanceEnrichment(value,{} as DictionaryReader,'v',()=>[])).progress!;
 progress=(await advanceEnrichment(value,{} as DictionaryReader,'v',()=>[],progress)).progress!;
 const dictionary:DictionaryReader={async lookup(_lang,words,version){await new Promise(resolve=>setTimeout(resolve,16-Number(words[0].slice(4))));return {version,ready:true,entries:words.map(word=>({word,reading:null,candidates:['meaning'],level:null}))};}};
 progress=(await advanceEnrichment(value,dictionary,'v',()=>[],progress)).progress!;
 assert.deepEqual(progress.resolved,Array.from({length:16},(_,i)=>`word${i}`));assert.deepEqual(progress.entries.map(e=>e.word),progress.resolved);
 progress=(await advanceEnrichment(value,dictionary,'v',()=>[],progress)).progress!;
 assert.equal(progress.resolved.length,17);assert.equal(progress.entries[16].word,'word16');
});


test('bounded parallelism covers ordinary scenes through 512 spans and falls back above it',async()=>{
 assert.equal(PARALLEL_LOOKUP_MAX_SPANS,512);
 for(const count of [256,257,371,512,513,2000]){
  const value={...input,text:Array.from({length:count},(_,i)=>'w'+String(i).padStart(4,'0')).join(' ')};
  let progress=(await advanceEnrichment(value,{} as DictionaryReader,'v',()=>[])).progress!;
  while(progress.prepareCursor<value.text.length)progress=(await advanceEnrichment(value,{} as DictionaryReader,'v',()=>[],progress)).progress!;
  assert.equal(progress.spans.length,count);
  const saved=JSON.stringify(progress);let active=0,maxActive=0,calls=0;
  const result=await advanceEnrichment(value,{async lookup(_lang,words,version){
   calls++;active++;maxActive=Math.max(maxActive,active);assert.ok(words.length<=4);
   await new Promise(resolve=>setTimeout(resolve,1));active--;
   return {version,ready:true,entries:words.map(word=>({word,reading:null,candidates:['meaning'],level:null}))};
  }},'v',()=>[],progress);
  const expected=count<=512?4:1;assert.equal(calls,expected);assert.equal(maxActive,expected);
  assert.equal(result.progress!.resolved.length,expected*4);assert.equal(JSON.stringify(progress),saved);
 }
});

test('synthetic 371-span and 197-key scene finishes 13 lookup rounds with exact output parity',async()=>{
 const words=Array.from({length:371},(_,i)=>'w'+String(i%197).padStart(3,'0'));
 const value={...input,text:words.join(' ')};let calls=0,lookupRounds=0;
 const dictionary:DictionaryReader={async lookup(_lang,keys,version){calls++;assert.ok(keys.length<=4);return {version,ready:true,entries:keys.map(word=>({word,reading:'/fixture/',candidates:['first meaning','second meaning'],level:null}))};}};
 let progress;let result;let deliveries=0;
 do{const before=calls;result=await advanceEnrichment(value,dictionary,'v',()=>[],progress);if(calls>before)lookupRounds++;progress=result.progress?JSON.parse(JSON.stringify(result.progress)):undefined;deliveries++;}while(progress&&deliveries<100);
 assert.ok(result.enriched);assert.equal(result.enriched.tokens.length,371);assert.equal(lookupRounds,13);assert.equal(calls,50);
 const full=await enrichSceneEdge(value,{async lookup(_lang,keys,version){return {version,ready:true,entries:keys.map(word=>({word,reading:'/fixture/',candidates:['first meaning','second meaning'],level:null}))};}},'v',()=>[]);
 assert.deepEqual(result.enriched,full);
});
