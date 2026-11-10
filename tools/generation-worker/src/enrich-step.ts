import {EdgeConfigurationError,enrichSceneEdge,prepareEnrichmentChunk,type DictionaryEntry,type DictionaryReader,type ChineseSegmenter,type EnrichmentSpan} from './enrich.js';
import type {EnrichSceneInput} from '../../story-pipeline/src/core/enrich-scene.js';
export interface EnrichmentProgress {
  version:string; input:string; spans:EnrichmentSpan[]; resolved:string[]; entries:DictionaryEntry[]; rendered:Awaited<ReturnType<typeof enrichSceneEdge>>["tokens"]; renderCursor:number; prepareCursor:number;
}
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
  const resolved=new Set(previous.resolved);
  const allKeys=new Set(previous.spans.map(s=>input.targetLang==='en'?s.word.toLowerCase():s.word));
  const missing=[...allKeys].filter(k=>!resolved.has(k));
  if(!missing.length&&allKeys.size!==resolved.size)throw new EdgeConfigurationError('Invalid enrichment keys.');
  if(missing.length){
    // Lookup is independent of token rendering: do not replay all cached reads.
    const requested=missing.slice(0,4),batch=await dictionary.lookup(input.targetLang,requested,version);
    if(!batch.ready||batch.version!==version||batch.entries.some(e=>!requested.includes(e.word)||!Array.isArray(e.candidates)||e.candidates.some(x=>typeof x!=='string')))
      throw new EdgeConfigurationError('Invalid asset dictionary response.');
    const entries=new Map(batch.entries.map(e=>[e.word,e]));
    return {progress:{...previous,resolved:[...previous.resolved,...requested],entries:[...previous.entries,...entries.values()]}};
  }
  if(previous.renderCursor===previous.spans.length)return {enriched:{tokens:previous.rendered,choices:input.choices,dictionaryVersion:version,unresolvedGlosses:previous.rendered.flatMap((t,tokenIndex)=>t.tier!=='base'&&!t.meaning?[{tokenIndex,word:t.word,candidates:t.candidates}]:[])}};
  const entries=new Map(previous.entries.map(e=>[e.word,e]));
  const enriched=await enrichSceneEdge(input,{async lookup(_language,words){return {version,ready:true,entries:words.flatMap(w=>entries.has(w)?[entries.get(w)!]:[])};}},version,segment,previous.spans.slice(previous.renderCursor,previous.renderCursor+64));
  return {progress:{...previous,rendered:[...previous.rendered,...enriched.tokens],renderCursor:previous.renderCursor+enriched.tokens.length}};
}
