import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { EnrichedToken, LanguageEnricher } from "./types.js";
import type { LevelLabel } from "../schema.js";
import { EN_BASE_WORDS, PUNCT_RE } from "./baseWords.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "..", "data");

/**
 * 英文富化器（学英文 / 释义中文）。
 *   分词    : Intl.Segmenter（granularity: "word"），按词边界切，标点独立成 token
 *   读音    : ECDICT 的 phonetic 字段（IPA）；缺失为 null
 *   释义候选: ECDICT 的 translation 字段（中文释义，按行/分号拆为候选）
 *   分级    : ECDICT 的 tag/collins/bnc/frq 推导 CEFR（见 mapCefr）
 *
 * ECDICT（data/ecdict.csv）为可选离线资源：缺失时降级（candidates=[]、level=null）。
 */

interface EcdictEntry {
  phonetic: string;
  translation: string;
  level: LevelLabel | null;
}

let ecdict: Map<string, EcdictEntry> | null = null;

// 用 collins 星级 / 词频粗映射 CEFR。ECDICT 无直接 CEFR 字段，用可得信号近似。
function mapCefr(collins: string, frq: string, bnc: string): LevelLabel | null {
  const c = parseInt(collins, 10);
  const f = parseInt(frq, 10) || parseInt(bnc, 10) || 0;
  if (c >= 5 || (f > 0 && f < 1000)) return "A1";
  if (c === 4 || (f > 0 && f < 2000)) return "A2";
  if (c === 3 || (f > 0 && f < 4000)) return "B1";
  if (c === 2 || (f > 0 && f < 8000)) return "B2";
  if (c === 1 || (f > 0 && f < 15000)) return "C1";
  if (f >= 15000) return "C2";
  return null;
}

function loadEcdict(): Map<string, EcdictEntry> {
  if (ecdict) return ecdict;
  ecdict = new Map();
  const path = join(DATA_DIR, "ecdict.csv");
  if (!existsSync(path)) return ecdict; // 降级：无词典
  const text = readFileSync(path, "utf8");
  const lines = text.split("\n");
  const header = lines[0].split(",");
  const idx = (name: string) => header.indexOf(name);
  const iWord = idx("word"), iPhon = idx("phonetic"), iTr = idx("translation"),
    iCollins = idx("collins"), iFrq = idx("frq"), iBnc = idx("bnc");
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (!cols || !cols[iWord]) continue;
    ecdict.set(cols[iWord].toLowerCase(), {
      phonetic: cols[iPhon] ?? "",
      translation: cols[iTr] ?? "",
      level: mapCefr(cols[iCollins] ?? "", cols[iFrq] ?? "", cols[iBnc] ?? ""),
    });
  }
  return ecdict;
}

// 极简 CSV 行解析（处理双引号包裹与转义 ""）。ECDICT 的 translation 含逗号/换行需引号包裹。
function parseCsvLine(line: string): string[] | null {
  if (line === "") return null;
  const out: string[] = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ",") { out.push(cur); cur = ""; }
      else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function splitGloss(translation: string): string[] {
  // ECDICT 中文释义常以 \n 或换行分隔多条；去掉词性前缀如 "n. "
  return translation
    .split(/\\n|\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 6);
}

export class EnEnricher implements LanguageEnricher {
  readonly target = "en" as const;
  readonly gloss = "zh" as const;

  private seg = new Intl.Segmenter("en", { granularity: "word" });

  enrich(sentence: string): EnrichedToken[] {
    const dict = loadEcdict();
    const tokens: EnrichedToken[] = [];

    for (const { segment, isWordLike } of this.seg.segment(sentence.trim())) {
      if (segment.trim() === "") continue; // 跳过纯空格
      if (!isWordLike || PUNCT_RE.test(segment)) {
        tokens.push({ word: segment, reading: null, candidates: [], level: null, baseGuess: true });
        continue;
      }
      const key = segment.toLowerCase();
      if (EN_BASE_WORDS.has(key)) {
        tokens.push({ word: segment, reading: null, candidates: [], level: dict.get(key)?.level ?? null, baseGuess: true });
        continue;
      }
      const entry = dict.get(key);
      tokens.push({
        word: segment,
        reading: entry?.phonetic ? `/${entry.phonetic}/` : null,
        candidates: entry ? splitGloss(entry.translation) : [],
        level: entry?.level ?? null,
        baseGuess: false,
      });
    }
    return tokens;
  }
}
