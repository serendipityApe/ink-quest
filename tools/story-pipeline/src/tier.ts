import type { HighlightTier, LevelLabel, TargetLang } from "./schema.js";
import type { EnrichedToken } from "./enrich/types.js";

/**
 * tier 判定：规则优先，剧情词强制 key。与 docs/story-generation-pipeline.md §6 一致。
 *
 *   1. base 初判（标点/功能词，富化层已置 baseGuess） → base
 *   2. 按 level 映射：低级→normal 倾向，高级→key
 *   3. 剧情关键词 → 强制 key（在 assemble 时叠加）
 */

function levelRank(level: LevelLabel | null, target: TargetLang): number {
  if (!level) return target === "zh" ? 3 : 2; // 查不到等级：给中等偏上，倾向 normal/key
  if (target === "zh") {
    const n = parseInt(String(level).replace(/\D/g, ""), 10);
    return isNaN(n) ? 3 : n; // HSK 1..9
  }
  // CEFR A1..C2 → 1..6
  const order: Record<string, number> = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 };
  return order[String(level)] ?? 3;
}

export function decideTier(tok: EnrichedToken, target: TargetLang): HighlightTier {
  if (tok.baseGuess) return "base";
  const rank = levelRank(tok.level, target);
  if (target === "zh") {
    if (rank <= 2) return "normal";      // HSK1~2 仍显示（生词层面），归 normal
    if (rank <= 4) return "normal";      // HSK2~4
    return "key";                        // HSK5+
  } else {
    if (rank <= 1) return "normal";      // A1
    if (rank <= 3) return "normal";      // A1~B1
    return "key";                        // B2+
  }
}

/** 从词典候选清洗出一条默认释义（agent 后续可改写）。 */
export function defaultMeaning(candidates: string[], gloss: string): string | null {
  if (candidates.length === 0) return null;
  let m = candidates[0].trim();
  // 英文释义（gloss=zh，来自 ECDICT）：去掉词性前缀如 "n. " "vt. "，取第一义
  if (gloss === "zh") {
    m = m.replace(/^[a-z]+\.\s*/i, "");
    m = m.split(/[,，;；/]/)[0].trim();
  } else {
    // 中文词的英文释义（gloss=en，来自 CC-CEDICT）：取第一条，去括注
    m = m.replace(/\([^)]*\)/g, "").trim();
  }
  return m || candidates[0].trim();
}
