// Isolated lexical fixtures (CC BY-SA4.0/CC BY4.0/MIT; see packaged licenses).
// No database, model, credit, production Queue or generation-store operations.
import {AssetDictionary} from './reader.mjs';
import fixtures from './fixtures.json';
let cached;
async function run(caseId,env){
 const known=['zh4','en4','ready','corrupt','missing'];
 if(!known.includes(caseId))throw Error('unknown_canary_case');
 let calls=0;
 const assets={fetch(req){calls++;return env.ASSETS.fetch(req);}};
 let reader=cached;
 if(!reader)cached=reader=new AssetDictionary(assets,env.DICTIONARY_VERSION,env.DICTIONARY_MANIFEST_SHA256);
 // A per-case wrapper counts fresh shard reads without caching shard payloads.
 reader.assets=assets;
 if(caseId==='corrupt'||caseId==='missing'){
  const fake={async fetch(){return caseId==='missing'?new Response('',{status:404}):new Response('{}');}};
  try{await new AssetDictionary(fake,env.DICTIONARY_VERSION,env.DICTIONARY_MANIFEST_SHA256).lookup('zh',[],env.DICTIONARY_VERSION);}catch{return{caseId,verified:true,failClosed:true,assetCalls:0};}
  throw Error('expected_integrity_failure');
 }
 const language=caseId==='en4'?'en':'zh',words=caseId==='ready'?[]:fixtures[language].slice(0,4);
 const result=await reader.lookup(language,words,env.DICTIONARY_VERSION);
 if(!result.ready||result.entries.length!==words.length||calls>50)throw Error('canary_result_mismatch');
 return {caseId,verified:true,entries:result.entries.length,assetCalls:calls,dictionaryVersion:result.version};
}
export default {
 async fetch(request,env){
  const caseId=new URL(request.url).pathname.slice(1);
  try{return Response.json(await run(caseId,env));}catch{return new Response('canary_failed',{status:503});}
 },
 async queue(batch,env){for(const message of batch.messages){
  try{console.log(JSON.stringify({event:'dictionary_asset_canary',...await run(message.body?.caseId,env)}));message.ack();}
  catch{console.log(JSON.stringify({event:'dictionary_asset_canary',caseId:message.body?.caseId,verified:false}));message.ack();}
 }}
};
