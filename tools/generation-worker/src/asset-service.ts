import type {DictionaryReader,DictionaryBatch} from './enrich.js';
import {EdgeConfigurationError} from './enrich.js';
import {StoreUnavailable} from './store.js';
export interface DictionaryServiceBinding {fetch(request:Request):Promise<Response>;}
export class AssetServiceReader implements DictionaryReader {
 constructor(private service:DictionaryServiceBinding,private version:string,private sourceVersion:string,private manifestSha256:string){
  if(!version||!sourceVersion||!/^[a-f0-9]{64}$/.test(manifestSha256))throw new EdgeConfigurationError('Asset dictionary configuration is missing.');
 }
 async lookup(language:'zh'|'en',words:string[],version:string):Promise<DictionaryBatch>{
  if(version!==this.version||words.length>4)throw new EdgeConfigurationError('Asset dictionary request exceeds its bound.');
  let response:Response;
  try{response=await this.service.fetch(new Request('https://dictionary.invalid/lookup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({language,words,version}),signal:AbortSignal.timeout(10000)}));}
  catch{throw new StoreUnavailable('Dictionary service response unavailable.');}
  if(response.status===424)throw new EdgeConfigurationError('Dictionary integrity or version mismatch.');
  if(!response.ok)throw new StoreUnavailable('Dictionary service unavailable.');
  let batch:DictionaryBatch&{sourceVersion:string;manifestSha256:string};
  try{batch=await response.json();}catch{throw new StoreUnavailable('Dictionary service returned an unknown response.');}
  if(!batch.ready||batch.version!==version||batch.sourceVersion!==this.sourceVersion||batch.manifestSha256!==this.manifestSha256||!Array.isArray(batch.entries))throw new EdgeConfigurationError('Dictionary identity mismatch.');
  return batch;
 }
}
