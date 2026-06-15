import type { TargetLang } from "../schema.js";
import type { LanguageEnricher } from "./types.js";
import { ZhEnricher } from "./zh.js";
import { EnEnricher } from "./en.js";

/** 按学习目标语言取富化器。 */
export function getEnricher(target: TargetLang): LanguageEnricher {
  switch (target) {
    case "zh": return new ZhEnricher();
    case "en": return new EnEnricher();
    default: throw new Error(`Unsupported target_lang: ${target}`);
  }
}

export type { EnrichedToken, LanguageEnricher } from "./types.js";
