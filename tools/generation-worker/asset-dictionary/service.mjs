import {AssetDictionary} from './reader.mjs';
let dictionary;
export async function lookupDictionary(language,words,version,env){
 if(version!==env.ASSET_DICTIONARY_VERSION)return {ok:false,reason:'integrity'};
 if(!['zh','en'].includes(language)||!Array.isArray(words)||words.length>4||words.some(w=>typeof w!=='string'||!w.length||[...w].length>256))return {ok:false,reason:'invalid'};
 try{
  dictionary??=new AssetDictionary(env.ASSETS,env.DICTIONARY_VERSION,env.DICTIONARY_MANIFEST_SHA256);
  const result=await dictionary.lookup(language,words,env.DICTIONARY_VERSION);
  return {ok:true,batch:{...result,version,sourceVersion:env.DICTIONARY_VERSION,manifestSha256:env.DICTIONARY_MANIFEST_SHA256}};
 }catch(e){return {ok:false,reason:/integrity|manifest_invalid|entry_invalid/.test(String(e.message))?'integrity':'unavailable'};}
}
export default {fetch(){return new Response('not_found',{status:404});}};
