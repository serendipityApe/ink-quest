import {test} from 'node:test';
import assert from 'node:assert/strict';
import {advanceEnrichment} from '../src/enrich-step.js';
import {enrichSceneEdge,type DictionaryReader} from '../src/enrich.js';
const input={text:Array.from({length:45},(_,i)=>`word${i}`).join(' '),choices:[],targetLang:'en' as const,glossLang:'zh' as const};
test('persisted lexical steps preserve whole-scene result and bound each read',async()=>{
 let calls=0,max=0;
 const dictionary:DictionaryReader={async lookup(_lang,words,version){calls++;max=Math.max(max,words.length);return {version,ready:true,entries:words.map(word=>({word,reading:null,candidates:['meaning'],level:null}))};}};
 let progress;let result;let steps=0;
 do{const previous=calls;result=await advanceEnrichment(input,dictionary,'fixture',()=>[],progress);assert.ok(calls-previous<=1);progress=result.progress?JSON.parse(JSON.stringify(result.progress)):undefined;steps++;}while(progress&&steps<20);
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
