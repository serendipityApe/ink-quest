/**
 * 功能词白名单：这些词（及标点）默认 tier=base，不高亮、无 tooltip。
 * 抽离自原 build-*.mjs 的 BASE_WORDS，供富化层共享。
 */

export const ZH_BASE_WORDS = new Set([
  "你", "我", "他", "她", "它", "的", "了", "在", "着", "中", "上", "里",
  "得", "也", "是", "和", "又", "就", "都", "还", "把", "向", "为", "这",
  "那", "他们", "我们", "你们",
]);

export const EN_BASE_WORDS = new Set([
  "the", "a", "an", "you", "i", "he", "she", "it", "we", "they", "to", "of",
  "in", "on", "at", "is", "are", "was", "were", "and", "but", "or", "your",
  "as", "so", "up", "out", "had", "has", "have", "this", "that", "with",
  "for", "its", "into", "no", "not", "be", "by",
]);

/** 标点（中英文通用）：始终 base。 */
export const PUNCT_RE = /^[\s，。！？：；、…—“”‘’.,!?:;"'()\[\]{}\-]+$/u;
