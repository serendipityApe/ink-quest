import type { TargetLang } from "../schema.js";
import type { TtsProvider } from "./types.js";
import { TencentTts } from "./tencent.js";

/**
 * 按 target_lang 选 TTS 供应商。未配置（无密钥）返回 null → 上层降级到估时。
 *
 * 当前：
 *   zh → 腾讯云（中文默认）
 *   en → 海外供应商（二期；暂时若配了腾讯云英文 key 也可临时用腾讯云 PrimaryLanguage=2）
 *
 * 可经 env STORY_TTS_<LANG>_PROVIDER 覆盖（预留，暂只实现 tencent）。
 */
export function getTtsProvider(target: TargetLang): TtsProvider | null {
  if (target === "zh") {
    return TencentTts.isConfigured() ? new TencentTts("zh") : null;
  }
  if (target === "en") {
    // TODO(P3.5): 接 Azure / ElevenLabs。暂时若配了腾讯云，用其英文合成兜底。
    return TencentTts.isConfigured() ? new TencentTts("en") : null;
  }
  return null;
}

export type { TtsProvider, TtsResult, WordTiming } from "./types.js";
