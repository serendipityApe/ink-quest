import {WorkerEntrypoint} from 'cloudflare:workers';
import service,{lookupDictionary} from './service.mjs';
export class Dictionary extends WorkerEntrypoint {
 lookup(language,words,version){return lookupDictionary(language,words,version,this.env);}
}
export default service;
