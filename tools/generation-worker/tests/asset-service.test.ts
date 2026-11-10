import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AssetServiceReader} from '../src/asset-service.js';
import {StoreUnavailable} from '../src/store.js';
import {EdgeConfigurationError} from '../src/enrich.js';
const digest='a'.repeat(64);
test('asset service requests preserve explicit source and manifest identity',async()=>{
 const reader=new AssetServiceReader({async fetch(r){const body=await r.json() as {words:string[];version:string};assert.equal(body.words.length,4);assert.equal(body.version,'asset-v1');return Response.json({version:'asset-v1',sourceVersion:'source-v1',manifestSha256:digest,ready:true,entries:[]});}},'asset-v1','source-v1',digest);
 assert.equal((await reader.lookup('en',['a','b','c','d'],'asset-v1')).ready,true);
 await assert.rejects(reader.lookup('en',['a','b','c','d','e'],'asset-v1'),EdgeConfigurationError);
 await assert.rejects(reader.lookup('en',[],'other'),EdgeConfigurationError);
});
test('temporary failures retry, but corrupted identity is a terminal configuration error',async()=>{
 for(const status of [503,424]){
  const reader=new AssetServiceReader({async fetch(){return new Response('',{status});}},'v','s',digest);
  await assert.rejects(reader.lookup('zh',[],'v'),status===503?StoreUnavailable:EdgeConfigurationError);
 }
 const reader=new AssetServiceReader({async fetch(){return Response.json({version:'v',sourceVersion:'s',manifestSha256:'b'.repeat(64),ready:true,entries:[]});}},'v','s',digest);
 await assert.rejects(reader.lookup('zh',[],'v'),EdgeConfigurationError);
});
