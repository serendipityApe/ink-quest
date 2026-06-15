import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Jieba } from "@node-rs/jieba";
import { dict as jiebaDict } from "@node-rs/jieba/dict";
import { pinyin } from "pinyin-pro";
import type { EnrichedToken, LanguageEnricher } from "./types.js";
import type { LevelLabel } from "../schema.js";
import { ZH_BASE_WORDS, PUNCT_RE } from "./baseWords.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "..", "data");

/**
 * 中文富化器（学中文 / 释义英文）。
 *   分词    : @node-rs/jieba
 *   读音    : pinyin-pro（带上下文多音字消歧）
 *   释义候选: CC-CEDICT（data/cedict_ts.u8，中→英）
 *   分级    : HSK 3.0 词表（data/hsk30.json）
 *
 * 词典/词表为可选离线资源：缺失时降级（candidates=[]、level=null），
 * 保证 P1 在未下载大文件时也能跑通分词 + 拼音。
 */

// —— CC-CEDICT：word -> 英文释义候选[] ——
let cedict: Map<string, string[]> | null = null;
function loadCedict(): Map<string, string[]> {
  if (cedict) return cedict;
  cedict = new Map();
  const path = join(DATA_DIR, "cedict_ts.u8");
  if (!existsSync(path)) return cedict; // 降级：无词典
  const text = readFileSync(path, "utf8");
  // 格式：繁 简 [pin1 yin1] /gloss1/gloss2/.../
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^(\S+)\s+(\S+)\s+\[[^\]]*\]\s+\/(.+)\/\s*$/);
    if (!m) continue;
    const simplified = m[2];
    const glosses = m[3].split("/").filter(Boolean);
    const prev = cedict.get(simplified);
    if (prev) prev.push(...glosses);
    else cedict.set(simplified, [...glosses]);
  }
  return cedict;
}

// —— HSK 3.0：word -> "HSK x" ——
let hsk: Map<string, LevelLabel> | null = null;
function loadHsk(): Map<string, LevelLabel> {
  if (hsk) return hsk;
  hsk = new Map();
  const path = join(DATA_DIR, "hsk30.json");
  if (!existsSync(path)) return hsk; // 降级：无词表
  // 期望格式：{ "1": ["你","好",...], "2": [...], ... } 或 { word: level }
  const raw = JSON.parse(readFileSync(path, "utf8"));
  if (Array.isArray(raw)) {
    // [{word, level}]
    for (const e of raw) if (e?.word && e?.level) hsk.set(e.word, `HSK ${String(e.level).replace(/\D/g, "")}` as LevelLabel);
  } else {
    for (const [k, v] of Object.entries(raw)) {
      if (Array.isArray(v)) {
        const label = `HSK ${k.replace(/\D/g, "")}` as LevelLabel;
        for (const w of v as string[]) hsk.set(w, label);
      } else if (typeof v === "string" || typeof v === "number") {
        hsk.set(k, `HSK ${String(v).replace(/\D/g, "")}` as LevelLabel);
      }
    }
  }
  return hsk;
}

const jieba = Jieba.withDict(jiebaDict);

export class ZhEnricher implements LanguageEnricher {
  readonly target = "zh" as const;
  readonly gloss = "en" as const;

  enrich(sentence: string): EnrichedToken[] {
    const dict = loadCedict();
    const levels = loadHsk();
    const words = jieba.cut(sentence.trim(), true); // 精确模式 + HMM 识别未登录词

    return words.map((word): EnrichedToken => {
      if (PUNCT_RE.test(word) || ZH_BASE_WORDS.has(word)) {
        return { word, reading: null, candidates: [], level: levels.get(word) ?? null, baseGuess: true };
      }
      const reading = pinyin(word, { toneType: "symbol", type: "string" }) || null;
      const candidates = dict.get(word) ?? [];
      const level = levels.get(word) ?? null;
      return { word, reading, candidates, level, baseGuess: false };
    });
  }
}
