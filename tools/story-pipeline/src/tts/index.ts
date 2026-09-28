import type { TargetLang } from "../schema.js";
import type { TtsProvider } from "./types.js";
import { TencentTts } from "./tencent.js";
import { AzureTts } from "./azure.js";

/** 按语言选供应商：显式指定优先，否则优先 Azure，再回退到腾讯云。 */
export function getTtsProvider(target: TargetLang): TtsProvider | null {
  const selected = process.env[`STORY_TTS_${target.toUpperCase()}_PROVIDER`];
  if (selected && selected !== "azure" && selected !== "tencent") {
    throw new Error(`Unsupported TTS provider: ${selected}`);
  }
  if (selected === "azure") return AzureTts.isConfigured() ? new AzureTts(target) : null;
  if (selected === "tencent") return TencentTts.isConfigured() ? new TencentTts(target) : null;
  if (AzureTts.isConfigured()) return new AzureTts(target);
  return TencentTts.isConfigured() ? new TencentTts(target) : null;
}

export type { TtsProvider, TtsResult, WordTiming } from "./types.js";
