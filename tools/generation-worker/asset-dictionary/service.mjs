import {AssetDictionary} from './reader.mjs';
let dictionary;
export default {async fetch(request,env){
 if(request.method!=='POST'||new URL(request.url).pathname!=='/lookup')return new Response('not_found',{status:404});
 try{
  const reader=request.body?.getReader();if(!reader)return new Response('invalid_request',{status:400});
  let size=0;const chunks=[];
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>8192){await reader.cancel();return new Response('invalid_request',{status:400});}chunks.push(value);}
  const bytes=new Uint8Array(size);let cursor=0;for(const c of chunks){bytes.set(c,cursor);cursor+=c.length;}
  const body=JSON.parse(new TextDecoder().decode(bytes));
  if(body.version!==env.ASSET_DICTIONARY_VERSION)return new Response('dictionary_version_mismatch',{status:424});
  dictionary??=new AssetDictionary(env.ASSETS,env.DICTIONARY_VERSION,env.DICTIONARY_MANIFEST_SHA256);
  const result=await dictionary.lookup(body.language,body.words,env.DICTIONARY_VERSION);
  return Response.json({...result,version:body.version,sourceVersion:env.DICTIONARY_VERSION,manifestSha256:env.DICTIONARY_MANIFEST_SHA256});
 }catch(e){
  const integrity=String(e.message).includes('integrity')||String(e.message).includes('manifest_invalid')||String(e.message).includes('entry_invalid');
  return new Response(integrity?'dictionary_integrity_failed':'dictionary_unavailable',{status:integrity?424:503});
 }
}};
