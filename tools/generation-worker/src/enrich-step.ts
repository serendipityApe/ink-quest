import {EdgeConfigurationError,enrichSceneEdge,prepareEnrichmentSpans,type DictionaryEntry,type DictionaryReader,type ChineseSegmenter,type EnrichmentSpan} from './enrich.js';
import type {EnrichSceneInput} from '../../story-pipeline/src/core/enrich-scene.js';
export interface EnrichmentProgress {
  version:string; input:string; spans:EnrichmentSpan[]; resolved:string[]; entries:DictionaryEntry[];
}
class Paused extends Error {}
export async function advanceEnrichment(input:EnrichSceneInput,dictionary:DictionaryReader,version:string,segment:ChineseSegmenter,previous?:EnrichmentProgress|null){
  const identity=JSON.stringify(input);
  if(!previous)return {progress:{version,input:identity,spans:prepareEnrichmentSpans(input,segment),resolved:[],entries:[]} as EnrichmentProgress};
  if(previous.version!==version||previous.input!==identity||!Array.isArray(previous.spans)||previous.spans.length>2000||!Array.isArray(previous.resolved)||previous.resolved.length>2000||!Array.isArray(previous.entries)||previous.entries.length>2000)
    throw new EdgeConfigurationError('Invalid enrichment checkpoint.');
  const progress=structuredClone(previous),resolved=new Set(progress.resolved),entries=new Map(progress.entries.map(e=>[e.word,e]));
  try{
    const enriched=await enrichSceneEdge(input,{async lookup(language,words,requestedVersion){
      const missing=words.filter(w=>!resolved.has(w));
      if(missing.length){
        const next=missing.slice(0,16);
        for(let i=0;i<next.length;i+=4){
          const requested=next.slice(i,i+4),batch=await dictionary.lookup(language,requested,requestedVersion);
          if(!batch.ready||batch.version!==version||batch.entries.some(e=>!requested.includes(e.word)||!Array.isArray(e.candidates)||e.candidates.some(x=>typeof x!=='string')))
            throw new EdgeConfigurationError('Invalid asset dictionary response.');
          for(const entry of batch.entries)entries.set(entry.word,entry);
        }
        progress.resolved.push(...next);progress.entries=[...entries.values()];
        // Persist before rendering, so lookup and final token CPU are separate.
        throw new Paused();
      }
      return {version,ready:true,entries:words.flatMap(w=>entries.has(w)?[entries.get(w)!]:[])};
    }},version,segment,progress.spans);
    return {enriched};
  }catch(error){if(error instanceof Paused)return {progress};throw error;}
}
