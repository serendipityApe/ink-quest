export const MAX_WORDS=48;
export function bucket(word){let h=2166136261;for(const b of new TextEncoder().encode(word))h=Math.imul(h^b,16777619)>>>0;return h%8192;}
const hex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
async function verified(response,expected,maxBytes,json=true){
 if(!response.ok)throw Error('dictionary_asset_unavailable');
 const buffer=await response.arrayBuffer();if(buffer.byteLength>maxBytes)throw Error('dictionary_asset_oversize');
 if(hex(await crypto.subtle.digest('SHA-256',buffer))!==expected)throw Error('dictionary_asset_integrity');
 return json?JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer)):buffer;
}
export class AssetDictionary {
 constructor(assets,version,manifestSha256){this.assets=assets;this.version=version;this.digest=manifestSha256;this.maxBatchSize=MAX_WORDS;}
 async manifest(){
  // Only the verified small manifest is cached, never the full lexical dataset.
  if(!this.pending)this.pending=(async()=>{
   const m=await verified(await this.assets.fetch(new Request(`https://dictionary.invalid/${this.version}/manifest.json`)),this.digest,512000);
   if(m.format!=='inkquest-assets-v1'||m.version!==this.version||m.rows!==892057||m.counts?.zh!==121446||m.counts?.en!==770611||m.buckets!==8192||m.files!==16384)throw Error('dictionary_manifest_invalid');
   m.catalog=new DataView(await verified(await this.assets.fetch(new Request(`https://dictionary.invalid/${this.version}/catalog.bin`)),m.catalogSha256,655360,false));
   if(m.catalog.byteLength!==655360)throw Error('dictionary_catalog_invalid');
   return m;
  })().catch(e=>{this.pending=null;throw e;});
  return this.pending;
 }
 async lookup(language,words,version){
  if(!['zh','en'].includes(language)||version!==this.version||!Array.isArray(words)||words.length>MAX_WORDS||words.some(w=>typeof w!=='string'||!w.length||w.length>256))throw Error('dictionary_request_invalid');
  const m=await this.manifest(),groups=new Map(),entries=[];
  for(const word of new Set(words)){const name=`${language}/${bucket(word).toString(16).padStart(4,'0')}.json`;if(!groups.has(name))groups.set(name,[]);groups.get(name).push(word);}
  // Sequential reads bound simultaneous buffers and stay under six connections.
  for(const [name,keys] of groups){
   const offset=((language==='en'?8192:0)+parseInt(name.slice(3),16))*40;
   const meta={sha256:hex(m.catalog.buffer.slice(offset,offset+32)),bytes:m.catalog.getUint32(offset+32,true)};if(meta.bytes>262144)throw Error('dictionary_shard_invalid');
   const data=await verified(await this.assets.fetch(new Request(`https://dictionary.invalid/${this.version}/${name}`)),meta.sha256,meta.bytes);
   for(const word of keys)if(Object.hasOwn(data,word)){
    const row=data[word];if(!Array.isArray(row)||row.length!==3||!Array.isArray(row[1])||row[1].some(x=>typeof x!=='string'))throw Error('dictionary_entry_invalid');
    entries.push({word,reading:row[0],candidates:row[1],level:row[2]});
   }
  }
  return {version,ready:true,entries};
 }
}
