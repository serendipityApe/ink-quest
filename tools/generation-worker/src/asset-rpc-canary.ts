// Production enrichment code + real private dictionary RPC. DB/model are fixtures.
import productionWorker from './index.js';
import {AssetServiceReader,type DictionaryServiceBinding} from './asset-service.js';
import {deliver,type Services} from './runner.js';
import {prepareEnrichmentSpans,prepareEnrichmentChunk} from './enrich.js';
import {segmentChinese,segmenterMemoryBytes} from './segment.js';
import {SupabaseEdgeStore} from './store.js';
import type {Lease,Outputs} from './contracts.js';
import type {EnrichmentProgress} from './enrich-step.js';
if(typeof productionWorker.queue!=='function')throw Error('production_graph_missing');
interface Env {DICTIONARY:DictionaryServiceBinding;GENERATION_DICTIONARY_VERSION:string;GENERATION_DICTIONARY_SOURCE_VERSION:string;GENERATION_DICTIONARY_MANIFEST_SHA256:string;}
const zh='小明今天来到图书馆，认真寻找一本关于宇宙的书。管理员微笑着告诉他，探索未知需要勇气和耐心。';
const en='Alice enters the quiet library and discovers a mysterious letter beside a silver key. ';
const BOUNDARY_CASES=['lookup-parallel-512-en','lookup-parallel-512-zh','lookup-parallel-512-late-en','lookup-parallel-512-late-zh','lookup-parallel-512-late-heavy-en','lookup-fallback-513-en'];
const IDs=[...BOUNDARY_CASES,'prepare-en','prepare-zh','lookup-en','lookup-zh','render-en','render-zh','finish-en','finish-zh','lookup-distinct','lookup-parallel-en','lookup-parallel-zh','invalid-version'];
const VERSION='assets-lex-244056cfff1d40670ec63f7b-6b262d70369a';
function makeFixture(caseId:string){
 const language=caseId.endsWith('zh')?'zh':'en';
 let text=caseId.startsWith('lookup-parallel')?(language==='zh'?zh.repeat(3):en.repeat(2)+'A patient traveler reads forgotten stories.'):caseId==='lookup-distinct'?Array.from({length:2000},(_,i)=>'w'+String(i).padStart(4,'0')).join(' '):language==='zh'?zh.repeat(70):en.repeat(100);
 if(caseId.includes('-512-')){
  const rich=['time','world','friend','city','book','library','family','story','garden','river','house','school','letter','window','water','light'];
  const terms=['今天','朋友','城市','故事','花园','河流','房子','学校','时间','世界','家庭','书信','窗户','清水','灯光','图书馆'];
  text=language==='en'?Array.from({length:512},(_,i)=>i<496?'w'+String(i).padStart(4,'0'):rich[i-496]).join(' '):Array.from({length:256},(_,i)=>terms[i%terms.length]).join('，')+'。';
 }
 if(caseId==='lookup-fallback-513-en')text=Array.from({length:513},(_,i)=>'w'+String(i).padStart(4,'0')).join(' ');
 const input={text,plotWords:[],choices:[],targetLang:language as 'zh'|'en',glossLang:language==='zh'?'en' as const:'zh' as const};
 const spans=prepareEnrichmentSpans(input,segmentChinese),keys=[...new Set(spans.map(s=>language==='en'?s.word.toLowerCase():s.word))];
 if(caseId.includes('-512-')&&spans.length!==512)throw Error('boundary_fixture_token_count');
 if(caseId==='lookup-fallback-513-en'&&spans.length!==513)throw Error('fallback_fixture_token_count');
 const fingerprint={provider:'fixture',model:'fixture',promptVersion:'fixture',dictionaryVersion:VERSION};
 const outputs:Outputs={fingerprint,scene:{text,plotWords:[],choices:[],summary:'fixture',stateDelta:{}}};
 {
  const resolved=caseId.startsWith('prepare')?[]:caseId.startsWith('lookup')?(caseId==='lookup-distinct'||caseId.includes('-late-')?keys.slice(0,-16):[]):keys;
  const progress:EnrichmentProgress={version:VERSION,input:JSON.stringify(input),spans,resolved,entries:resolved.map(word=>({word,reading:null,candidates:caseId.includes('-heavy-')?Array.from({length:8},(_,i)=>'fixture '+i+' '+('bounded candidate '.repeat(7))):['fixture meaning'],level:null})),rendered:[],renderCursor:0,prepareCursor:input.text.trim().length};
  if(caseId.startsWith('prepare')){progress.spans=[];progress.prepareCursor=0;while(progress.prepareCursor+384<input.text.trim().length){const next=prepareEnrichmentChunk(input,segmentChinese,progress.prepareCursor);progress.spans.push(...next.spans);progress.prepareCursor=next.prepareCursor;}}
  if(caseId.startsWith('finish')){progress.renderCursor=spans.length;progress.rendered=spans.map(s=>({word:s.word,tier:'base',reading:null,candidates:[],level:null,meaning:null}));}
  outputs.enrichmentProgress=progress;
 }
 const lease={owner:'isolated-fixture',epoch:1,phase:'enrich',ambiguous:false,outputs,job:{jobId:'11111111-1111-4111-8111-111111111111',jobType:'opening',targetLanguage:language,ttsMode:'off'}} as unknown as Lease;
return {language:language as 'zh'|'en',spans,leaseBytes:new TextEncoder().encode(JSON.stringify({kind:'claimed',lease}))};
}
const FIXTURES=new Map(IDs.filter(x=>x!=='invalid-version').map(id=>[id,makeFixture(id)]));
async function run(caseId:string,env:Env){
 if(!IDs.includes(caseId))throw Error('unknown_fixture');
 let rpcCalls=0,activeReads=0,maxConcurrentReads=0,lookupWords=0,dictionaryHits=0;const dictionary=new AssetServiceReader({async lookup(...args){rpcCalls++;lookupWords+=args[1].length;activeReads++;maxConcurrentReads=Math.max(maxConcurrentReads,activeReads);try{const result=await env.DICTIONARY.lookup(...args);if(result.ok&&result.batch)dictionaryHits+=result.batch.entries.length;return result;}finally{activeReads--;}}},env.GENERATION_DICTIONARY_VERSION,env.GENERATION_DICTIONARY_SOURCE_VERSION,env.GENERATION_DICTIONARY_MANIFEST_SHA256);
 if(caseId==='invalid-version'){
  const result=await env.DICTIONARY.lookup('en',[],'wrong-version');if(result.ok||result.reason!=='integrity')throw Error('version_guard_missing');return {caseId,verified:true,rpcCalls:1,modelCalls:0,databaseCalls:0};
 }
 const prepared=FIXTURES.get(caseId)!;const {language,spans,leaseBytes}=prepared;
 let checkpointBytes=0;let phase='';let simulatedDatabaseCalls=0;
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async(input,options)=>{
  const url=String(input);if(!url.startsWith('https://database.invalid/rest/v1/rpc/'))throw Error('external_fetch_prohibited');
  const method=url.slice(url.lastIndexOf('/')+1);simulatedDatabaseCalls++;
  if(method==='edge_claim_generation_job')return new Response(leaseBytes,{headers:{'Content-Type':'application/json'}});
  if(method==='edge_checkpoint_enrichment_step'||method==='edge_checkpoint_generation_stage'){
   // Production store serializes once. The database parses on its own CPU.
   const body=String(options?.body);checkpointBytes=new TextEncoder().encode(body).length;
   phase=method==='edge_checkpoint_enrichment_step'?'enrich':body.includes('"p_next":"gloss"')?'gloss':'';
   return Response.json({jobId:'11111111-1111-4111-8111-111111111111',revision:1});
  }
  if(method==='edge_mark_generation_published')return new Response(null,{status:204});
  throw Error('unexpected_database_rpc');
 };
 const store=new SupabaseEdgeStore('https://database.invalid','fixture-key',dictionary);
 const fingerprint={provider:'fixture',model:'fixture',promptVersion:'fixture',dictionaryVersion:env.GENERATION_DICTIONARY_VERSION};
 const services:Services={store,queue:{async send(){}},dictionaryVersion:env.GENERATION_DICTIONARY_VERSION,incrementalDictionary:true,segmentChinese,provider:()=>({...fingerprint,async planStory(){throw Error('model_prohibited');},async writeScene(){throw Error('model_prohibited');},async resolveGlosses(){throw Error('model_prohibited');}}),async preflight(){await dictionary.lookup(language,[],env.GENERATION_DICTIONARY_VERSION);},async audio(){throw Error('audio_prohibited');}};
 let acked=false;try{await deliver({body:{jobId:'11111111-1111-4111-8111-111111111111'},ack(){acked=true;},retry(){throw Error('unexpected_retry');}},services);}finally{globalThis.fetch=originalFetch;}
 if(!acked||!checkpointBytes||rpcCalls>(caseId.startsWith('lookup')?5:1)||checkpointBytes>1000000)throw Error('step_bound_failed');
 if((caseId==='lookup-distinct'||caseId==='lookup-fallback-513-en')&&(rpcCalls!==2||lookupWords!==4||maxConcurrentReads!==1))throw Error('parallel_lookup_bound_failed');
 if(caseId.startsWith('lookup-parallel')&&(rpcCalls!==5||lookupWords!==16||maxConcurrentReads!==4))throw Error('short_parallel_lookup_bound_failed');
 if(caseId.includes('-512-late-')&&dictionaryHits===0)throw Error('real_dictionary_hits_missing');
 if(caseId.startsWith('finish')?phase!=='gloss':phase!=='enrich')throw Error('step_transition_failed');
 return {caseId,verified:true,rpcCalls,lookupWords,maxConcurrentReads,dictionaryHits,modelCalls:0,databaseCalls:0,simulatedDatabaseCalls,wasmMemoryBytes:segmenterMemoryBytes(),checkpointBytes,tokens:spans.length,phase};
}
export default {fetch(){return new Response('not_found',{status:404});},async queue(batch:{messages:Array<{body:{caseId?:string};ack():void}>},env:Env){
 for(const message of batch.messages){try{console.log(JSON.stringify({event:'dictionary_asset_canary',...await run(message.body.caseId??'',env)}));}catch{console.log(JSON.stringify({event:'dictionary_asset_canary',caseId:message.body.caseId,verified:false}));}message.ack();}
}};
