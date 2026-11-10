// Production enrichment code + real private dictionary RPC. DB/model are fixtures.
import productionWorker from './index.js';
import {AssetServiceReader,type DictionaryServiceBinding} from './asset-service.js';
import {deliver,type Services} from './runner.js';
import {prepareEnrichmentSpans} from './enrich.js';
import {segmentChinese,segmenterMemoryBytes} from './segment.js';
import type {Lease,EdgeStore,Outputs} from './contracts.js';
import type {EnrichmentProgress} from './enrich-step.js';
if(typeof productionWorker.queue!=='function')throw Error('production_graph_missing');
interface Env {DICTIONARY:DictionaryServiceBinding;GENERATION_DICTIONARY_VERSION:string;GENERATION_DICTIONARY_SOURCE_VERSION:string;GENERATION_DICTIONARY_MANIFEST_SHA256:string;}
const zh='小明今天来到图书馆，认真寻找一本关于宇宙的书。管理员微笑着告诉他，探索未知需要勇气和耐心。';
const en='Alice enters the quiet library and discovers a mysterious letter beside a silver key. ';
const IDs=['prepare-en','prepare-zh','lookup-en','lookup-zh','render-en','render-zh','finish-en','finish-zh','lookup-distinct','invalid-version'];
const VERSION='assets-lex-244056cfff1d40670ec63f7b-6b262d70369a';
function makeFixture(caseId:string){
 const language=caseId.endsWith('zh')?'zh':'en';
 const text=caseId==='lookup-distinct'?Array.from({length:2000},(_,i)=>'w'+String(i).padStart(4,'0')).join(' '):language==='zh'?zh.repeat(70):en.repeat(100);
 const input={text,plotWords:[],choices:[],targetLang:language as 'zh'|'en',glossLang:language==='zh'?'en' as const:'zh' as const};
 const spans=prepareEnrichmentSpans(input,segmentChinese),keys=[...new Set(spans.map(s=>language==='en'?s.word.toLowerCase():s.word))];
 const fingerprint={provider:'fixture',model:'fixture',promptVersion:'fixture',dictionaryVersion:VERSION};
 const outputs:Outputs={fingerprint,scene:{text,plotWords:[],choices:[],summary:'fixture',stateDelta:{}}};
 if(!caseId.startsWith('prepare')){
  const resolved=caseId.startsWith('lookup')?(caseId==='lookup-distinct'?keys.slice(0,-16):[]):keys;
  const progress:EnrichmentProgress={version:VERSION,input:JSON.stringify(input),spans,resolved,entries:resolved.map(word=>({word,reading:null,candidates:['fixture meaning'],level:null})),rendered:[],renderCursor:0};
  if(caseId.startsWith('finish')){progress.renderCursor=spans.length;progress.rendered=spans.map(s=>({word:s.word,tier:'base',reading:null,candidates:[],level:null,meaning:null}));}
  outputs.enrichmentProgress=progress;
 }
 const lease={owner:'isolated-fixture',epoch:1,phase:'enrich',ambiguous:false,outputs,job:{jobId:'11111111-1111-4111-8111-111111111111',jobType:'opening',targetLanguage:language,ttsMode:'off'}} as unknown as Lease;
return {language:language as 'zh'|'en',spans,leaseJson:JSON.stringify({kind:'claimed',lease})};
}
const FIXTURES=new Map(IDs.filter(x=>x!=='invalid-version').map(id=>[id,makeFixture(id)]));
async function run(caseId:string,env:Env){
 if(!IDs.includes(caseId))throw Error('unknown_fixture');
 let rpcCalls=0;const dictionary=new AssetServiceReader({lookup(...args){rpcCalls++;return env.DICTIONARY.lookup(...args);}},env.GENERATION_DICTIONARY_VERSION,env.GENERATION_DICTIONARY_SOURCE_VERSION,env.GENERATION_DICTIONARY_MANIFEST_SHA256);
 if(caseId==='invalid-version'){
  const result=await env.DICTIONARY.lookup('en',[],'wrong-version');if(result.ok||result.reason!=='integrity')throw Error('version_guard_missing');return {caseId,verified:true,rpcCalls:1,modelCalls:0,databaseCalls:0};
 }
 const prepared=FIXTURES.get(caseId)!;const {language,spans,leaseJson}=prepared;
 let patch:Outputs|undefined;let phase='';let simulatedDatabaseCalls=0;
 const store:EdgeStore={async claim(){simulatedDatabaseCalls++;return JSON.parse(leaseJson);},lookup:dictionary.lookup.bind(dictionary),async checkpoint(_lease,next,value){simulatedDatabaseCalls++;phase=next;patch=JSON.parse(JSON.stringify(value));return {jobId:'11111111-1111-4111-8111-111111111111',revision:1};},async published(){simulatedDatabaseCalls++;},async fail(){throw Error('fixture_failed');},async begin(){throw Error('unexpected_begin');},async commitText(){throw Error('commit_prohibited');},async commitAudio(){throw Error('audio_prohibited');},async pending(){return[];},async recover(){} };
 const fingerprint={provider:'fixture',model:'fixture',promptVersion:'fixture',dictionaryVersion:env.GENERATION_DICTIONARY_VERSION};
 const services:Services={store,queue:{async send(){}},dictionaryVersion:env.GENERATION_DICTIONARY_VERSION,incrementalDictionary:true,segmentChinese,provider:()=>({...fingerprint,async planStory(){throw Error('model_prohibited');},async writeScene(){throw Error('model_prohibited');},async resolveGlosses(){throw Error('model_prohibited');}}),async preflight(){await dictionary.lookup(language,[],env.GENERATION_DICTIONARY_VERSION);},async audio(){throw Error('audio_prohibited');}};
 let acked=false;await deliver({body:{jobId:'11111111-1111-4111-8111-111111111111'},ack(){acked=true;},retry(){throw Error('unexpected_retry');}},services);
 if(!acked||!patch||rpcCalls>5||new TextEncoder().encode(JSON.stringify(patch)).length>1000000)throw Error('step_bound_failed');
 if(caseId.startsWith('finish')?phase!=='gloss':phase!=='enrich')throw Error('step_transition_failed');
 return {caseId,verified:true,rpcCalls,modelCalls:0,databaseCalls:0,simulatedDatabaseCalls,wasmMemoryBytes:segmenterMemoryBytes(),checkpointBytes:new TextEncoder().encode(JSON.stringify(patch)).length,tokens:spans.length,phase};
}
export default {fetch(){return new Response('not_found',{status:404});},async queue(batch:{messages:Array<{body:{caseId?:string};ack():void}>},env:Env){
 for(const message of batch.messages){try{console.log(JSON.stringify({event:'dictionary_asset_canary',...await run(message.body.caseId??'',env)}));}catch{console.log(JSON.stringify({event:'dictionary_asset_canary',caseId:message.body.caseId,verified:false}));}message.ack();}
}};
