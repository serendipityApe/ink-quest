import type {DictionaryReader,DictionaryBatch} from './enrich.js';
import {EdgeConfigurationError} from './enrich.js';
import {StoreUnavailable} from './store.js';
export interface DictionaryServiceBinding {lookup(language:string,words:string[],version:string):Promise<{ok:boolean;reason?:string;batch?:DictionaryBatch&{sourceVersion:string;manifestSha256:string}}>;}
export class AssetServiceReader implements DictionaryReader {
 constructor(private service:DictionaryServiceBinding,private version:string,private sourceVersion:string,private manifestSha256:string){
  if(!version||!sourceVersion||!/^[a-f0-9]{64}$/.test(manifestSha256))throw new EdgeConfigurationError('Asset dictionary configuration is missing.');
 }
 async lookup(language:'zh'|'en',words:string[],version:string):Promise<DictionaryBatch>{
  if(version!==this.version||words.length>4)throw new EdgeConfigurationError('Asset dictionary request exceeds its bound.');
  let response:Awaited<ReturnType<DictionaryServiceBinding['lookup']>>;
  try{response=await this.service.lookup(language,words,version);}
  catch{throw new StoreUnavailable('Dictionary service response unavailable.');}
  if(!response.ok){
   if(response.reason==='integrity'||response.reason==='invalid')throw new EdgeConfigurationError('Dictionary integrity or version mismatch.');
   throw new StoreUnavailable('Dictionary service unavailable.');
  }
  const batch=response.batch;
  if(!batch)throw new StoreUnavailable('Dictionary service returned an unknown response.');
  if(!batch.ready||batch.version!==version||batch.sourceVersion!==this.sourceVersion||batch.manifestSha256!==this.manifestSha256||!Array.isArray(batch.entries))throw new EdgeConfigurationError('Dictionary identity mismatch.');
  return batch;
 }
}
