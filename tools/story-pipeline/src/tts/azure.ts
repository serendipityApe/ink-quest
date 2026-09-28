import * as speechSdk from "microsoft-cognitiveservices-speech-sdk";
import type { TargetLang } from "../schema.js";
import type { TtsProvider, TtsResult } from "./types.js";
import { alignAzureBoundaries, spokenText, type AzureBoundary } from "./azure-align.js";
import "../env.js";

const DEFAULT_VOICES: Record<TargetLang, string> = {
  zh: "zh-CN-XiaoxiaoNeural",
  en: "en-US-JennyNeural",
};
const SYNTHESIS_TIMEOUT_MS = 120_000;

export class AzureTts implements TtsProvider {
  readonly name = "azure";
  readonly lang: TargetLang;
  private readonly key: string;
  private readonly region: string;

  constructor(lang: TargetLang) {
    this.lang = lang;
    this.key = process.env.AZURE_SPEECH_KEY ?? "";
    this.region = process.env.AZURE_SPEECH_REGION ?? "";
  }

  static isConfigured(): boolean {
    return Boolean(process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION);
  }

  async synthesize(words: string[], voice?: string): Promise<TtsResult> {
    if (!this.key || !this.region) throw new Error("Azure Speech TTS is not configured.");
    if (!words.length || words.some((word) => !word)) throw new Error("Azure Speech TTS requires nonempty segments.");

    const voiceId = voice?.trim() || process.env[`AZURE_TTS_VOICE_${this.lang.toUpperCase()}`] || DEFAULT_VOICES[this.lang];
    const config = speechSdk.SpeechConfig.fromSubscription(this.key, this.region);
    config.speechSynthesisVoiceName = voiceId;
    config.speechSynthesisOutputFormat = speechSdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;

    const synthesizer = new speechSdk.SpeechSynthesizer(config, null);
    const boundaries: AzureBoundary[] = [];
    synthesizer.wordBoundary = (_sender, event) => {
      if (event.boundaryType !== speechSdk.SpeechSynthesisBoundaryType.Sentence) {
        boundaries.push({
          audioOffset: event.audioOffset,
          duration: event.duration,
          textOffset: event.textOffset,
          wordLength: event.wordLength,
        });
      }
    };

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        new Promise<speechSdk.SpeechSynthesisResult>((resolve, reject) => {
          synthesizer.speakTextAsync(spokenText(words, this.lang), resolve, reject);
        }),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error("Azure Speech TTS timed out.")), SYNTHESIS_TIMEOUT_MS);
        }),
      ]);
      if (result.reason !== speechSdk.ResultReason.SynthesizingAudioCompleted) {
        throw new Error(`Azure Speech TTS failed: ${result.errorDetails || result.reason}`);
      }
      if (!result.audioData?.byteLength) throw new Error("Azure Speech TTS returned no audio.");
      const timings = alignAzureBoundaries(words, this.lang, boundaries);
      const durationMs = result.audioDuration / 10_000;
      if (Number.isFinite(durationMs) && durationMs > 0 && timings.at(-1)!.end > durationMs + 10) {
        throw new Error("Azure Speech TTS word boundaries exceed audio duration.");
      }
      return {
        audio: Buffer.from(result.audioData),
        timings,
        durationMs: Number.isFinite(durationMs) && durationMs > 0 ? Math.round(durationMs) : undefined,
        voiceId,
      };
    } finally {
      if (timer) clearTimeout(timer);
      synthesizer.close();
    }
  }
}
