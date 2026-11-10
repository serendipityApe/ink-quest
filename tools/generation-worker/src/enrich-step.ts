import {EdgeConfigurationError,enrichSceneEdge,prepareEnrichmentChunk,type DictionaryEntry,type DictionaryReader,type ChineseSegmenter,type EnrichmentSpan} from './enrich.js';
import type {EnrichSceneInput} from '../../story-pipeline/src/core/enrich-scene.js';
// Keep every asset RPC within its independently verified four-word bound.
// Four concurrent reads amortize queue/database latency without loading the
// complete dictionary or changing segmentation/rendering/checkpoint bounds.
export const LOOKUP_WORDS_PER_RPC = 4;
export const LOOKUP_RPCS_PER_STEP = 4;
export const PARALLEL_LOOKUP_MAX_SPANS = 512;
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
    // Large checkpoints keep the previously verified single-RPC path.
    const rpcLimit=previous.spans.length<=PARALLEL_LOOKUP_MAX_SPANS?LOOKUP_RPCS_PER_STEP:1;
    const requested=missing.slice(0,LOOKUP_WORDS_PER_RPC*rpcLimit);
    const groups=Array.from({length:Math.ceil(requested.length/LOOKUP_WORDS_PER_RPC)},(_,index)=>requested.slice(index*LOOKUP_WORDS_PER_RPC,(index+1)*LOOKUP_WORDS_PER_RPC));
    // Await all reads, including failures, before allowing a retry. A partial
    // batch is never checkpointed; only side-effect-free dictionary reads repeat.
    const results=await Promise.allSettled(groups.map(async words=>{
      const batch=await dictionary.lookup(input.targetLang,words,version);
      if(!batch.ready||batch.version!==version||!Array.isArray(batch.entries)||batch.entries.some(e=>!words.includes(e.word)||!Array.isArray(e.candidates)||e.candidates.some(x=>typeof x!=='string')))
        throw new EdgeConfigurationError('Invalid asset dictionary response.');
      return batch.entries;
    }));
    const failure=results.find(result=>result.status==='rejected');
    if(failure?.status==='rejected')throw failure.reason;
    const entries=new Map(results.flatMap(result=>result.status==='fulfilled'?result.value:[]).map(e=>[e.word,e]));
    return {progress:{...previous,resolved:[...previous.resolved,...requested],entries:[...previous.entries,...entries.values()]}};
  }
  if(previous.renderCursor===previous.spans.length)return {enriched:{tokens:previous.rendered,choices:input.choices,dictionaryVersion:version,unresolvedGlosses:previous.rendered.flatMap((t,tokenIndex)=>t.tier!=='base'&&!t.meaning?[{tokenIndex,word:t.word,candidates:t.candidates}]:[])}};
  const entries=new Map(previous.entries.map(e=>[e.word,e]));
  const enriched=await enrichSceneEdge(input,{async lookup(_language,words){return {version,ready:true,entries:words.flatMap(w=>entries.has(w)?[entries.get(w)!]:[])};}},version,segment,previous.spans.slice(previous.renderCursor,previous.renderCursor+64));
  return {progress:{...previous,rendered:[...previous.rendered,...enriched.tokens],renderCursor:previous.renderCursor+enriched.tokens.length}};
}
