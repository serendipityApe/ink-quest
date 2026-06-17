"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 单字读音 hook：基于 Web Speech API 的一次性 TTS。
 *
 * 与 useAudioSync 的区别：useAudioSync 服务于「整段朗读 + 按时间戳点亮当前段」，
 * 这里只负责「点一下读一个词」，不需要时间戳/段索引。
 *
 * 注意：speak 之前先 cancel()，避免快速点击时队列堆积；组件卸载时也 cancel，
 * 防止 TTS 在不可见状态下还在念。
 */
export function useSpeak() {
  const [speaking, setSpeaking] = useState(false);
  const supportedRef = useRef(
    typeof window !== "undefined" && !!window.speechSynthesis
  );

  const cancel = useCallback(() => {
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, []);

  const speak = useCallback((text: string, lang: "zh" | "en" = "zh") => {
    if (!supportedRef.current || typeof window === "undefined") return;
    window.speechSynthesis.cancel();

    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = lang === "en" ? "en-US" : "zh-CN";
    utt.rate = 0.85;

    // 优先精确匹配 zh-CN / en-US，找不到再退到任意 zh / en voice。
    // 不同 OS 的 voice 质量差距很大，这里只能尽量挑通用语种。
    const voices = window.speechSynthesis.getVoices();
    const exact = lang === "en" ? "en-US" : "zh-CN";
    const matched =
      voices.find((v) => v.lang === exact) ||
      voices.find((v) =>
        lang === "en"
          ? v.lang.toLowerCase().startsWith("en")
          : v.lang.toLowerCase().startsWith("zh")
      );
    if (matched) utt.voice = matched;

    utt.onstart = () => setSpeaking(true);
    utt.onend = () => setSpeaking(false);
    utt.onerror = () => setSpeaking(false);

    window.speechSynthesis.speak(utt);
  }, []);

  useEffect(() => () => cancel(), [cancel]);

  return { speak, cancel, speaking, supported: supportedRef.current };
}
