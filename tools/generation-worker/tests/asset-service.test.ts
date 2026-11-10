import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AssetServiceReader} from '../src/asset-service.js';
import {StoreUnavailable} from '../src/store.js';
import {EdgeConfigurationError} from '../src/enrich.js';
const digest='a'.repeat(64);
test('private RPC preserves source and manifest identity and bounds input',async()=>{
 const reader=new AssetServiceReader({async lookup(_language,words,version){assert.equal(words.length,4);assert.equal(version,'v');return {ok:true,batch:{version:'v',sourceVersion:'s',manifestSha256:digest,ready:true,entries:[]}};}},'v','s',digest);
 assert.equal((await reader.lookup('en',['a','b','c','d'],'v')).ready,true);
 await assert.rejects(reader.lookup('en',['a','b','c','d','e'],'v'),EdgeConfigurationError);
 await assert.rejects(reader.lookup('en',[],'other'),EdgeConfigurationError);
});
test('unavailable private RPC retries; corrupted identity terminates safely',async()=>{
 for(const reason of ['unavailable','integrity']){
  const reader=new AssetServiceReader({async lookup(){return {ok:false,reason};}},'v','s',digest);
  await assert.rejects(reader.lookup('zh',[],'v'),reason==='unavailable'?StoreUnavailable:EdgeConfigurationError);
 }
 const reader=new AssetServiceReader({async lookup(){return {ok:true,batch:{version:'v',sourceVersion:'s',manifestSha256:'b'.repeat(64),ready:true,entries:[]}};}},'v','s',digest);
 await assert.rejects(reader.lookup('zh',[],'v'),EdgeConfigurationError);
});
