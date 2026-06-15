import type { LevelLabel, TargetLang, Lang } from "../schema.js";

/**
 * 富化层：把一句正文切词并机械填充读音/释义候选/分级。
 * 纯确定性（库 + 词表），不含 LLM、不含网络。LLM 消歧在后续阶段处理。
 */

export interface EnrichedToken {
  /** 分词后的词面 */
  word: string;
  /** 读音：中文拼音 / 英文 IPA；标点或查不到为 null */
  reading: string | null;
  /** 词典给出的释义候选池（gloss_lang 语言）；供后续 LLM 消歧。可能为空 */
  candidates: string[];
  /** 分级标签（HSK x / CEFR x）；查不到为 null */
  level: LevelLabel | null;
  /** 是否疑似功能词/标点（tier=base 的初判依据） */
  baseGuess: boolean;
}

export interface LanguageEnricher {
  readonly target: TargetLang;
  readonly gloss: Lang;
  /** 把一句正文富化为 token 列表 */
  enrich(sentence: string): EnrichedToken[];
}
