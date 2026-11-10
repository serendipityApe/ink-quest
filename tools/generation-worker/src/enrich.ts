import { pinyin } from "pinyin-pro";
import { EN_BASE_WORDS, ZH_BASE_WORDS, PUNCT_RE } from "../../story-pipeline/src/enrich/baseWords.js";
import { decideTier, defaultMeaning } from "../../story-pipeline/src/tier.js";
import type { EnrichedToken } from "../../story-pipeline/src/enrich/types.js";
import type { EnrichSceneInput, EnrichSceneResult } from "../../story-pipeline/src/core/enrich-scene.js";
import type { LevelLabel } from "../../story-pipeline/src/schema.js";

export class EdgeConfigurationError extends Error {
  constructor(message: string, readonly code = "generation_configuration_unavailable") {
    super(message); this.name = "EdgeConfigurationError";
  }
}
export interface DictionaryEntry { word: string; reading: string | null; candidates: string[]; level: LevelLabel | null; }
export interface DictionaryBatch { version: string; ready: boolean; entries: DictionaryEntry[]; }
export interface DictionaryReader {
  lookup(language: "zh" | "en", words: string[], version: string): Promise<DictionaryBatch>;
}
export type ChineseSegmenter = (text: string) => string[];
export interface EnrichmentSpan { word: string; base: boolean; }
export function prepareEnrichmentSpans(input: EnrichSceneInput, segmentChinese: ChineseSegmenter): EnrichmentSpan[] {
  if (input.text.length > 12_000) throw new EdgeConfigurationError("Scene exceeds the bounded enrichment size.");
  const spans = tokenizeSpans(input.text.trim(),input.targetLang,segmentChinese);
  if (spans.length > 2000) throw new EdgeConfigurationError("Scene exceeds the bounded token count.");
  return spans;
}
function tokenizeSpans(text:string,language:"zh"|"en",segmentChinese:ChineseSegmenter):EnrichmentSpan[]{
  return language === "zh"
    ? segmentChinese(text).map(word => ({ word, base: PUNCT_RE.test(word) || ZH_BASE_WORDS.has(word) }))
    : [...new Intl.Segmenter("en", { granularity: "word" }).segment(text)]
      .filter(s => s.segment.trim()).map(s => ({ word: s.segment, base: !s.isWordLike || PUNCT_RE.test(s.segment) || EN_BASE_WORDS.has(s.segment.toLowerCase()) }));
}
// Cut only at Jieba/Intl sentence or whitespace boundaries, preserving each word.
export function prepareEnrichmentChunk(input:EnrichSceneInput,segment:ChineseSegmenter,cursor:number){
 const text=input.text.trim();if(text.length>12000||cursor<0||cursor>text.length)throw new EdgeConfigurationError('Invalid preparation cursor.');
 let end=Math.min(cursor+384,text.length);
 if(end<text.length){let boundary=end;while(boundary>cursor&&(!/[\s。！？；，、]/u.test(text[boundary-1])||(text[boundary-1]==='\r'&&text[boundary]==='\n')))boundary--;if(boundary===cursor)throw new EdgeConfigurationError('Scene contains an unbounded lexical run.');end=boundary;}
 return {spans:tokenizeSpans(text.slice(cursor,end),input.targetLang,segment),prepareCursor:end};
}

export async function enrichSceneEdge(input: EnrichSceneInput, dictionary: DictionaryReader,
  version: string, segmentChinese: ChineseSegmenter, preparedSpans?: EnrichmentSpan[]): Promise<EnrichSceneResult & { dictionaryVersion: string }> {
  if (!version) throw new EdgeConfigurationError("A verified dictionary version is required.");
  if (input.text.length > 12_000) throw new EdgeConfigurationError("Scene exceeds the bounded enrichment size.");
  const spans = preparedSpans ?? prepareEnrichmentSpans(input, segmentChinese);
  if (spans.length > 2000) throw new EdgeConfigurationError("Scene exceeds the bounded token count.");
  const keys = [...new Set(spans.map(s => input.targetLang === "en" ? s.word.toLowerCase() : s.word))];
  const entries = new Map<string, DictionaryEntry>();
  for (let index = 0; index < Math.max(1, keys.length); index += 100) {
    const batch = await dictionary.lookup(input.targetLang, keys.slice(index, index + 100), version);
    if (!batch.ready || batch.version !== version) throw new EdgeConfigurationError("Dictionary is unavailable or its version does not match.");
    for (const entry of batch.entries) {
      if (!keys.includes(entry.word) || !Array.isArray(entry.candidates)) throw new EdgeConfigurationError("Invalid dictionary response.");
      entries.set(entry.word, entry);
    }
  }
  const plotWords = new Set(input.plotWords ?? []);
  const tokens = spans.map(({ word, base }) => {
    const entry = entries.get(input.targetLang === "en" ? word.toLowerCase() : word);
    const token: EnrichedToken = { word, baseGuess: base,
      reading: input.targetLang === "zh" ? (base ? null : pinyin(word, { toneType: "symbol", type: "string" }) || null) : entry?.reading ?? null,
      candidates: entry?.candidates ?? [], level: entry?.level ?? null };
    const key = plotWords.has(word);
    const tier = key ? "key" : decideTier(token, input.targetLang);
    return { word, tier, candidates: token.candidates,
      reading: tier === "base" ? null : token.reading, level: tier === "base" ? null : token.level,
      meaning: tier === "base" ? null : defaultMeaning(token.candidates, input.glossLang),
      ...(key ? { isPlotKeyword: true } : {}) };
  });
  return { tokens, choices: input.choices, dictionaryVersion: version,
    unresolvedGlosses: tokens.flatMap((t, tokenIndex) => t.tier !== "base" && !t.meaning ? [{ tokenIndex, word: t.word, candidates: t.candidates }] : []) };
}
