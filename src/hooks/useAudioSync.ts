"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { Timestamp } from "@/types/story";

interface PlayOpts {
  audioUrl?: string | null;
  text: string;
  timestamps: Timestamp[];
  voices: SpeechSynthesisVoice[];
  lang?: "zh" | "en";
  /** 播放范围（毫秒）。仅在 audioUrl 走真实音频路径时生效；
   *  TTS fallback 不支持时间切片，调用方需自行预切 text。 */
  startMs?: number;
  endMs?: number;
}

interface UseAudioSyncReturn {
  isPlaying: boolean;
  activeSegmentIndex: number;
  play: (opts: PlayOpts) => void;
  stop: () => void;
}

export function useAudioSync(): UseAudioSyncReturn {
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState(-1);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // TTS fallback refs
  const startTimeRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  const timestampsRef = useRef<Timestamp[]>([]);

  const clearRaf = useCallback(() => cancelAnimationFrame(rafRef.current), []);

  const tick = useCallback(() => {
    const elapsed = performance.now() - startTimeRef.current;
    const ts = timestampsRef.current;
    let idx = -1;
    for (let i = 0; i < ts.length; i++) {
      if (elapsed >= ts[i].start && elapsed < ts[i].end) { idx = i; break; }
    }
    setActiveSegmentIndex(idx);
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.ontimeupdate = null;
      audioRef.current.onended = null;
      audioRef.current = null;
    }
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    clearRaf();
    setIsPlaying(false);
    setActiveSegmentIndex(-1);
  }, [clearRaf]);

  const play = useCallback((opts: PlayOpts) => {
    const { audioUrl, text, timestamps, voices, lang = "zh", startMs, endMs } = opts;
    stop();

    if (audioUrl) {
      // ── Real audio path（支持时间切片：startMs/endMs）─────────────────────
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      const hasRange = typeof endMs === "number";

      audio.ontimeupdate = () => {
        const ms = audio.currentTime * 1000;
        // 时间切片：到达 endMs 立即停 —— 比 onended 早
        if (hasRange && ms >= (endMs as number)) {
          stop();
          return;
        }
        let idx = -1;
        for (let i = 0; i < timestamps.length; i++) {
          if (ms >= timestamps[i].start && ms < timestamps[i].end) { idx = i; break; }
        }
        setActiveSegmentIndex(idx);
      };

      audio.onplay = () => setIsPlaying(true);

      audio.onended = () => {
        setIsPlaying(false);
        setActiveSegmentIndex(-1);
        audioRef.current = null;
      };

      audio.onerror = () => {
        setIsPlaying(false);
        setActiveSegmentIndex(-1);
        audioRef.current = null;
      };

      // 先 seek 再 play —— Safari 上 seek 可能异步，
      // 用 loadedmetadata 兜底确保起点准确（已加载过则同步触发）。
      const startSec = (startMs ?? 0) / 1000;
      const startPlayback = () => {
        try { audio.currentTime = startSec; } catch { /* noop */ }
        audio.play().catch(() => {
          setIsPlaying(false);
          audioRef.current = null;
        });
      };
      if (startSec > 0) {
        if (audio.readyState >= 1) startPlayback();
        else audio.addEventListener("loadedmetadata", startPlayback, { once: true });
      } else {
        startPlayback();
      }
    } else {
      // ── TTS fallback（无音频文件；时间切片不生效，调用方自行切 text）──────
      if (typeof window === "undefined" || !window.speechSynthesis) return;
      const utterance = new SpeechSynthesisUtterance(text);
      const matchLang = (v: SpeechSynthesisVoice) =>
        lang === "en"
          ? v.lang.toLowerCase().startsWith("en")
          : v.lang.includes("zh-CN") || v.lang.includes("zh-HK") || v.lang.includes("zh-TW");
      const voice = voices.find(matchLang);
      if (voice) utterance.voice = voice;
      utterance.lang = lang === "en" ? "en-US" : "zh-CN";
      utterance.rate = 0.85;
      timestampsRef.current = timestamps;

      utterance.onstart = () => {
        startTimeRef.current = performance.now();
        setIsPlaying(true);
        rafRef.current = requestAnimationFrame(tick);
      };
      utterance.onend = () => { clearRaf(); setIsPlaying(false); setActiveSegmentIndex(-1); };
      utterance.onerror = () => { clearRaf(); setIsPlaying(false); setActiveSegmentIndex(-1); };
      window.speechSynthesis.speak(utterance);
    }
  }, [stop, tick, clearRaf]);

  useEffect(() => () => { stop(); }, [stop]);

  return { isPlaying, activeSegmentIndex, play, stop };
}
