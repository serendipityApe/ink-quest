import { getEnricher } from "../enrich/index.js";
import type { Lang, StoryChoice, TargetLang } from "../schema.js";
import { decideTier, defaultMeaning } from "../tier.js";
import type { EnrichedTokenItem } from "../types-draft.js";

export interface EnrichSceneInput {
  text: string;
  plotWords?: string[];
  choices: StoryChoice[];
  targetLang: TargetLang;
  glossLang: Lang;
}

export interface UnresolvedGloss {
  tokenIndex: number;
  word: string;
  candidates: string[];
}

export interface EnrichSceneResult {
  choices: StoryChoice[];
  tokens: EnrichedTokenItem[];
  unresolvedGlosses: UnresolvedGloss[];
}

export function enrichScene(input: EnrichSceneInput): EnrichSceneResult {
  const plotWords = new Set(input.plotWords ?? []);
  const enricher = getEnricher(input.targetLang);
  const tokens = enricher.enrich(input.text).map((token): EnrichedTokenItem => {
    const isPlotKeyword = plotWords.has(token.word);
    const tier = isPlotKeyword ? "key" : decideTier(token, input.targetLang);
    const item: EnrichedTokenItem = {
      word: token.word,
      reading: tier === "base" ? null : token.reading,
      level: tier === "base" ? null : token.level,
      tier,
      candidates: token.candidates,
      meaning: tier === "base" ? null : defaultMeaning(token.candidates, input.glossLang),
    };
    if (isPlotKeyword) item.isPlotKeyword = true;
    return item;
  });

  const unresolvedGlosses = tokens.flatMap((token, tokenIndex) =>
    token.tier !== "base" && !token.meaning
      ? [{ tokenIndex, word: token.word, candidates: token.candidates }]
      : []
  );

  return { choices: input.choices, tokens, unresolvedGlosses };
}
