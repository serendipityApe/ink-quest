import type { TargetLang } from "../schema.js";

/** 词级时间戳，与输入 words[] 一一对应（毫秒）。 */
export interface WordTiming {
  start: number;
  end: number;
}

export interface TtsResult {
  /** 音频字节（mp3） */
  audio: Buffer;
  /** 词级时间戳，长度 === 输入 words.length，已从供应商的字符/音素级聚合到词 */
  timings: WordTiming[];
}

export interface TtsProvider {
  readonly name: string;
  readonly lang: TargetLang;
  /**
   * 合成一段文本的音频 + 词级对齐。
   * 入参 words[] 是富化层已固定的分词；供应商内部把字符级时间戳聚合回词，
   * 保证返回的 timings 与 words 一一对应。
   */
  synthesize(words: string[], voice?: string): Promise<TtsResult>;
}
