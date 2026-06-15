"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { Timestamp } from "@/types/story";

interface UseAudioSyncReturn {
  isPlaying: boolean;
  activeSegmentIndex: number;
  play: (opts: { audioUrl?: string | null; text: string; timestamps: Timestamp[]; voices: SpeechSynthesisVoice[]; lang?: "zh" | "en" }) => void;
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
    // Stop real audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.ontimeupdate = null;
      audioRef.current.onended = null;
      audioRef.current = null;
    }
    // Stop TTS fallback
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    clearRaf();
    setIsPlaying(false);
    setActiveSegmentIndex(-1);
  }, [clearRaf]);

  const play = useCallback(({ audioUrl, text, timestamps, voices, lang = "zh" }: {
    audioUrl?: string | null;
    text: string;
    timestamps: Timestamp[];
    voices: SpeechSynthesisVoice[];
    lang?: "zh" | "en";
  }) => {
    stop();

    if (audioUrl) {
      // ── Real audio path ──────────────────────────────────────────────────
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.ontimeupdate = () => {
        const ms = audio.currentTime * 1000;
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

      audio.play().catch(() => {
        setIsPlaying(false);
        audioRef.current = null;
      });
    } else {
      // ── TTS fallback (no audio file) ─────────────────────────────────────
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
