import {EdgeConfigurationError,enrichSceneEdge,prepareEnrichmentChunk,type DictionaryEntry,type DictionaryReader,type ChineseSegmenter,type EnrichmentSpan} from './enrich.js';
import type {EnrichSceneInput} from '../../story-pipeline/src/core/enrich-scene.js';
export interface EnrichmentProgress {
  version:string; input:string; spans:EnrichmentSpan[]; resolved:string[]; entries:DictionaryEntry[]; rendered:Awaited<ReturnType<typeof enrichSceneEdge>>["tokens"]; renderCursor:number; prepareCursor:number;
}
class Paused extends Error {}
export async function advanceEnrichment(input:EnrichSceneInput,dictionary:DictionaryReader,version:string,segment:ChineseSegmenter,previous?:EnrichmentProgress|null){
  const identity=JSON.stringify(input);
  if(!previous)return {progress:{version,input:identity,spans:[],resolved:[],entries:[],rendered:[],renderCursor:0,prepareCursor:0} as EnrichmentProgress};
  if(previous.version!==version||previous.input!==identity||!Array.isArray(previous.spans)||previous.spans.length>2000||!Array.isArray(previous.resolved)||previous.resolved.length>2000||!Array.isArray(previous.entries)||previous.entries.length>2000||!Array.isArray(previous.rendered)||previous.rendered.length!==previous.renderCursor||previous.renderCursor<0||previous.renderCursor>previous.spans.length||!Number.isInteger(previous.prepareCursor)||previous.prepareCursor<0||previous.prepareCursor>input.text.trim().length)
    throw new EdgeConfigurationError('Invalid enrichment checkpoint.');
  if(previous.prepareCursor<input.text.trim().length){
    if(previous.resolved.length||previous.entries.length||previous.renderCursor)throw new EdgeConfigurationError('Invalid unfinished preparation.');
    const chunk=prepareEnrichmentChunk(input,segment,previous.prepareCursor);
    const spans=[...previous.spans,...chunk.spans];if(spans.length>2000)throw new EdgeConfigurationError('Scene exceeds the bounded token count.');
    return {progress:{...previous,spans,prepareCursor:chunk.prepareCursor}};
  }
  // Entries and spans are immutable; only the progress arrays are appended.
  const progress={...previous,resolved:[...previous.resolved],entries:[...previous.entries],rendered:[...previous.rendered]},resolved=new Set(progress.resolved);
  const allKeys=new Set(progress.spans.map(s=>input.targetLang==='en'?s.word.toLowerCase():s.word));
  const rendering=allKeys.size===resolved.size&&[...allKeys].every(k=>resolved.has(k));
  if(rendering&&progress.renderCursor===progress.spans.length)return {enriched:{tokens:progress.rendered,choices:input.choices,dictionaryVersion:version,unresolvedGlosses:progress.rendered.flatMap((t,tokenIndex)=>t.tier!=='base'&&!t.meaning?[{tokenIndex,word:t.word,candidates:t.candidates}]:[])}};
  const entries=new Map(progress.entries.map(e=>[e.word,e]));
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
    }},version,segment,rendering?progress.spans.slice(progress.renderCursor,progress.renderCursor+64):progress.spans);
    if(!rendering)throw new EdgeConfigurationError("Invalid enrichment render state.");
    progress.rendered.push(...enriched.tokens);progress.renderCursor+=enriched.tokens.length;
    return {progress};
  }catch(error){if(error instanceof Paused)return {progress};throw error;}
}
