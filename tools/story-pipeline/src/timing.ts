import type { TargetLang, Timestamp, TextSegment } from "./schema.js";

/**
 * 估时（P3 接入真实 TTS 词级时间戳前的占位实现）。
 * 与原 build-*.mjs 的估时一致：按词长/语言估朗读时长，生成连续 timestamps。
 * P3 接腾讯云/海外 TTS 后，此函数被真实词边界替换（见 docs §5）。
 */

const PUNCT = /^[\s，。！？：；、…—“”‘’.,!?:;"'()\[\]{}\-]+$/u;

function durationOf(word: string, isBase: boolean, target: TargetLang): number {
  if (PUNCT.test(word)) return target === "zh" ? 150 : 180;
  if (target === "zh") {
    const hasQuote = /[“”""]/.test(word);
    const chars = word.replace(/[^一-鿿]/g, "").length || 1;
    if (hasQuote) return Math.min(300 + chars * 280, 4500);
    if (isBase) return chars <= 1 ? 200 : 150 + chars * 180;
    return 200 + chars * 180;
  }
  // en：按字母数估，含基线
  const len = word.replace(/[^A-Za-z]/g, "").length || 1;
  return Math.min((isBase ? 120 : 180) + len * 55, 1400);
}

export function estimateTimestamps(segments: TextSegment[], target: TargetLang): Timestamp[] {
  const ts: Timestamp[] = [];
  let cursor = 0;
  for (const seg of segments) {
    const dur = durationOf(seg.word, seg.tier === "base", target);
    ts.push({ start: cursor, end: cursor + dur });
    cursor += dur;
  }
  return ts;
}
