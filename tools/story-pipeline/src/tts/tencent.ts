import type { TargetLang } from "../schema.js";
import type { TtsProvider, TtsResult, WordTiming } from "./types.js";
import { buildHeaders } from "./tencent-sign.js";

/**
 * 腾讯云 TTS（TextToVoice）实现。中文默认供应商。
 * 文档：https://cloud.tencent.com/document/api/1073/37995
 *
 * 处理三个适配点（见 docs/story-generation-pipeline.md §5.2）：
 *  1. 字符级 Subtitles → 按词的字符区间聚合到词级 WordTiming；
 *  2. 文本长度限制（中文 ~150 字）→ 分块合成；
 *  3. 多块拼接：音频字节拼接 + 后续块时间戳整体加前序累计时长偏移。
 *
 * 鉴权走环境变量，不入仓：TENCENT_SECRET_ID / TENCENT_SECRET_KEY。
 * 可选：TENCENT_TTS_VOICE（VoiceType，需选支持时间戳的音色）。
 */

const HOST = "tts.tencentcloudapi.com";
const ACTION = "TextToVoice";
const VERSION = "2019-08-23";

interface Subtitle {
  Text: string;
  BeginTime: number; // ms
  EndTime: number;
  BeginIndex: number; // ⚠️ 英文是「词序号」，中文是「字符序号」——语义不统一，不可依赖
  EndIndex: number;
}

interface TtsResponseInner {
  Audio: string;            // base64
  Subtitles?: Subtitle[];
  Error?: { Code: string; Message: string };
}

// 中文单块上限（留余量，全角标点算 1 字）；英文按字母 500 上限，给词留空格余量
const ZH_CHUNK_LIMIT = 140;
const EN_CHUNK_LIMIT = 400;

/** 词间分隔符：中文无分隔，英文用空格（影响合成发音与字符索引）。 */
function sepFor(lang: TargetLang): string {
  return lang === "en" ? " " : "";
}

/** 按词聚成不超过 limit 字的块；尽量在标点后断开。 */
function chunkWords(words: string[], limit: number, sep: string): string[][] {
  const chunks: string[][] = [];
  let cur: string[] = [];
  let len = 0;
  const isBreak = (w: string) => /[。！？；，、.!?;,]$/.test(w);
  for (const w of words) {
    const add = w.length + (cur.length ? sep.length : 0);
    if (len + add > limit && cur.length) {
      chunks.push(cur);
      cur = [];
      len = 0;
    }
    cur.push(w);
    len += w.length + (cur.length > 1 ? sep.length : 0);
    if (isBreak(w) && len > limit * 0.6) {
      chunks.push(cur);
      cur = [];
      len = 0;
    }
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

/**
 * 把腾讯云返回的 Subtitles 聚合到我们的词级时间戳。
 *
 * ⚠️ 不依赖 BeginIndex/EndIndex —— 它们语义因语言而异（英文是词序号、中文是字符序号），
 * 不可靠。改为「文本流对齐」：腾讯云的 Subtitles 本质是一串带时间的文本片段，
 * 顺序拼起来等于合成文本。逐词消费这串片段，按字符累计匹配每个词的跨度，
 * 取覆盖该词的所有片段的 min(BeginTime)/max(EndTime)。对中英文都成立。
 */
function aggregateToWords(words: string[], subs: Subtitle[]): WordTiming[] {
  // 归一化：去掉空白用于字符比对（腾讯云可能把空格/标点单列或并入）
  const norm = (s: string) => s.replace(/\s+/g, "");
  const stream = subs.map((s) => ({ text: norm(s.Text), begin: s.BeginTime, end: s.EndTime }));

  const out: WordTiming[] = [];
  let si = 0;        // 当前 subtitle 下标
  let off = 0;       // 当前 subtitle 内已被消费的字符数

  for (const word of words) {
    const target = norm(word);
    if (target === "") { out.push({ start: 0, end: 0 }); continue; }

    let acc = 0;
    let begin = -1, end = -1;
    while (si < stream.length && acc < target.length) {
      const seg = stream[si];
      const avail = seg.text.length - off;
      if (avail <= 0) { si++; off = 0; continue; }
      if (begin === -1) begin = seg.begin;
      const take = Math.min(avail, target.length - acc);
      acc += take;
      off += take;
      end = seg.end;
      if (off >= seg.text.length) { si++; off = 0; }
    }
    out.push(begin === -1 ? { start: 0, end: 0 } : { start: begin, end });
  }
  return out;
}

export class TencentTts implements TtsProvider {
  readonly name = "tencent";
  readonly lang: TargetLang;
  private secretId: string;
  private secretKey: string;
  private region: string;
  private defaultVoice: number;

  constructor(lang: TargetLang) {
    this.lang = lang;
    this.secretId = process.env.TENCENT_SECRET_ID ?? "";
    this.secretKey = process.env.TENCENT_SECRET_KEY ?? "";
    this.region = process.env.TENCENT_REGION ?? "ap-guangzhou";
    this.defaultVoice = parseInt(process.env.TENCENT_TTS_VOICE ?? "501000", 10);
  }

  static isConfigured(): boolean {
    return !!process.env.TENCENT_SECRET_ID && !!process.env.TENCENT_SECRET_KEY;
  }

  async synthesize(words: string[], voice?: string): Promise<TtsResult> {
    const voiceType = voice ? parseInt(voice, 10) : this.defaultVoice;
    const sep = sepFor(this.lang);
    const limit = this.lang === "en" ? EN_CHUNK_LIMIT : ZH_CHUNK_LIMIT;
    const chunks = chunkWords(words, limit, sep);

    const audioParts: Buffer[] = [];
    const timings: WordTiming[] = [];
    let timeOffset = 0; // 累计音频时长（ms），用于后续块时间戳偏移

    for (const chunkWordsArr of chunks) {
      const text = chunkWordsArr.join(sep);
      const { audio, subs } = await this.callOne(text, voiceType);
      audioParts.push(audio);

      const chunkTimings = aggregateToWords(chunkWordsArr, subs);
      // 该块最大 EndTime 作为本块时长（无字幕时退化为 0）
      const chunkDur = subs.length ? Math.max(...subs.map((s) => s.EndTime)) : 0;
      for (const t of chunkTimings) {
        timings.push({ start: t.start + timeOffset, end: t.end + timeOffset });
      }
      timeOffset += chunkDur;
    }

    // 修补空洞（某些词无字幕重叠时 start/end=0）：用相邻时间戳线性填补，保证单调
    repairMonotonic(timings);

    return { audio: Buffer.concat(audioParts), timings };
  }

  private async callOne(text: string, voiceType: number): Promise<{ audio: Buffer; subs: Subtitle[] }> {
    const payload = JSON.stringify({
      Text: text,
      SessionId: `inkquest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      VoiceType: voiceType,
      PrimaryLanguage: this.lang === "en" ? 2 : 1,
      SampleRate: 16000,
      Codec: "mp3",
      EnableSubtitle: true,
    });

    const headers = buildHeaders({
      secretId: this.secretId,
      secretKey: this.secretKey,
      service: "tts",
      host: HOST,
      action: ACTION,
      version: VERSION,
      region: this.region,
      payload,
    });

    const res = await fetch(`https://${HOST}`, { method: "POST", headers, body: payload });
    const json = (await res.json()) as { Response: TtsResponseInner };
    const r = json.Response;
    if (r.Error) throw new Error(`腾讯云 TTS 错误 ${r.Error.Code}: ${r.Error.Message}`);
    if (!r.Audio) throw new Error("腾讯云 TTS 未返回音频");

    return {
      audio: Buffer.from(r.Audio, "base64"),
      subs: r.Subtitles ?? [],
    };
  }
}

/** 把 start/end=0 的空洞用前后相邻时间戳填补，并保证整体单调不减。 */
function repairMonotonic(timings: WordTiming[]): void {
  let lastEnd = 0;
  for (let i = 0; i < timings.length; i++) {
    const t = timings[i];
    if (t.start === 0 && t.end === 0) {
      // 空洞：贴到上一个结束，给一个最小时长
      t.start = lastEnd;
      t.end = lastEnd + 120;
    }
    if (t.start < lastEnd) t.start = lastEnd;
    if (t.end <= t.start) t.end = t.start + 120;
    lastEnd = t.end;
  }
}
