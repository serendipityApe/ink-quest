import {test} from 'node:test';
import assert from 'node:assert/strict';
import {advanceEnrichment} from '../src/enrich-step.js';
import {enrichSceneEdge,type DictionaryReader} from '../src/enrich.js';
const input={text:Array.from({length:45},(_,i)=>`word${i}`).join(' '),choices:[],targetLang:'en' as const,glossLang:'zh' as const};
test('persisted lexical steps preserve whole-scene result and bound each read',async()=>{
 let calls=0,max=0;
 const dictionary:DictionaryReader={async lookup(_lang,words,version){calls++;max=Math.max(max,words.length);return {version,ready:true,entries:words.map(word=>({word,reading:null,candidates:['meaning'],level:null}))};}};
 let progress;let result;let steps=0;
 do{const previous=calls;result=await advanceEnrichment(input,dictionary,'fixture',()=>[],progress);assert.ok(calls-previous<=4);progress=result.progress?JSON.parse(JSON.stringify(result.progress)):undefined;steps++;}while(progress&&steps<20);
 assert.ok(result.enriched);assert.ok(max<=4);assert.ok(steps>3);assert.deepEqual(result.enriched,await enrichSceneEdge(input,dictionary,'fixture',()=>[]));
});
test('partial lookup failure leaves persisted progress unchanged for redelivery',async()=>{
 const initial=(await advanceEnrichment(input,{lookup:async()=>{throw Error();}},'v',()=>[])).progress!;
 const saved=JSON.stringify(initial);let calls=0;
 await assert.rejects(()=>advanceEnrichment(input,{async lookup(_lang,words,version){if(++calls===2)throw Error('missing shard');return {version,ready:true,entries:[]};}},'v',()=>[],initial),/missing shard/);
 assert.equal(JSON.stringify(initial),saved);
 await assert.rejects(()=>advanceEnrichment(input,{async lookup(){return {version:'wrong',ready:true,entries:[]};}},'v',()=>[],initial),/Invalid asset/);
 await assert.rejects(()=>advanceEnrichment({...input,text:'changed'}, {lookup:async()=>{throw Error();}},'v',()=>[],initial),/Invalid enrichment/);
});
