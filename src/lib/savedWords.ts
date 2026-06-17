/**
 * 收藏单词的本地存储层。
 *
 * 单一存储：cm_saved_words 存 SavedWord[]（带读音/释义/级别/语种）。
 * 旧版本曾经存过 string[]，loadSavedWords 读到非对象格式时直接当空处理 ——
 * 项目刚上线、收藏量极低，没有迁移成本。
 *
 * 同步把 savedWordsCount 一起写，给 Navbar/统计区直接读。
 */

import type { TextSegment } from "@/types/story";

export interface SavedWord {
  word: string;
  reading: string | null;
  meaning: string | null;
  level: string | null;
  /** 词所属故事的目标语言，决定 TTS 用哪个 voice。 */
  lang: "zh" | "en";
  /** 保存时间（毫秒），收藏页按倒序展示。 */
  savedAt: number;
}

const KEY = "cm_saved_words";
const COUNT_KEY = "savedWordsCount";

export function loadSavedWords(): SavedWord[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // 过滤掉老的 string[] 残留：只保留具备 word 字符串字段的对象
    return parsed.filter(
      (it): it is SavedWord => it && typeof it === "object" && typeof it.word === "string"
    );
  } catch {
    return [];
  }
}

function persist(words: SavedWord[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(words));
  localStorage.setItem(COUNT_KEY, String(words.length));
}

/**
 * 切换收藏：词存在则移除，不存在则追加。
 * 已存在时即便 entry 带了更新的 reading/meaning 也不覆盖 —— 切换本质是「删除」语义。
 */
export function toggleSaved(
  words: SavedWord[],
  entry: Omit<SavedWord, "savedAt">
): SavedWord[] {
  const exists = words.some((w) => w.word === entry.word);
  const next = exists
    ? words.filter((w) => w.word !== entry.word)
    : [...words, { ...entry, savedAt: Date.now() }];
  persist(next);
  return next;
}

/** 移除单个收藏词。 */
export function removeWord(words: SavedWord[], word: string): SavedWord[] {
  const next = words.filter((w) => w.word !== word);
  persist(next);
  return next;
}

/**
 * 把 TextSegment 与目标语言压成可保存的 SavedWord（不含 savedAt）。
 * tier === "base" 的词不该走到这里；调用方需自行过滤。
 */
export function fromSegment(
  seg: TextSegment,
  lang: "zh" | "en"
): Omit<SavedWord, "savedAt"> {
  return {
    word: seg.word,
    reading: seg.reading,
    meaning: seg.meaning,
    level: seg.level,
    lang,
  };
}
