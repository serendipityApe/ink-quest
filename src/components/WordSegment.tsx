"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Bookmark, BookmarkCheck } from "lucide-react";
import type { TextSegment } from "@/types/story";

interface WordSegmentProps {
  segment: TextSegment;
  index: number;
  isAudioActive: boolean;
  savedWords: string[];
  onSave: (word: string) => void;
}

export default function WordSegment({ segment, index, isAudioActive, savedWords, onSave }: WordSegmentProps) {
  const { word, reading, meaning, level, tier } = segment;
  const [showTooltip, setShowTooltip] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSaved = savedWords.includes(word);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handleMouseEnter = useCallback(() => {
    if (tier === "base") return;
    setIsHovering(true);
    if (tier === "key") {
      setShowTooltip(true);
    } else {
      // normal: wait for underline animation to complete (700ms)
      timerRef.current = setTimeout(() => setShowTooltip(true), 700);
    }
  }, [tier]);

  const handleMouseLeave = useCallback((e: React.MouseEvent<HTMLSpanElement>) => {
    if (tier === "base") return;
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    clearTimer();
    setIsHovering(false);
    setShowTooltip(false);
  }, [tier, clearTimer]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  if (tier === "base") {
    return (
      <span className={isAudioActive ? "word-audio-active" : ""}>{word}</span>
    );
  }

  const baseClass = tier === "key" ? "word-key" : "word-normal";
  const hoverClass = tier === "normal" && isHovering ? "is-hovering" : "";
  const audioClass = isAudioActive ? "word-audio-active" : "";

  return (
    <span
      className={`relative inline-block ${baseClass} ${hoverClass} ${audioClass}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {word}

      {showTooltip && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 pb-3 bg-surface/90 border border-surface-container-high/60 rounded-xl px-4 pt-3 shadow-xl glass-panel text-center flex flex-col gap-1.5 z-30 min-w-[180px] animate-in fade-in slide-in-from-bottom-2 duration-150">
          {reading && (
            <span className="font-ui-pinyin-sm text-sm text-secondary font-medium block">{reading}</span>
          )}
          {meaning && (
            <span className="font-ui-body text-sm text-on-surface-variant block whitespace-normal">{meaning}</span>
          )}
          {level && (
            <span className="text-[10px] uppercase tracking-wider text-primary bg-primary-container/10 px-2 py-0.5 rounded-full inline-block mx-auto">
              {level}
            </span>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onSave(word); }}
            className={`mt-1.5 font-button-text text-[11px] uppercase tracking-wider py-1 px-3 rounded-full flex items-center justify-center gap-1.5 cursor-pointer border ${
              isSaved
                ? "bg-primary text-white border-primary"
                : "bg-primary/5 text-primary border-primary/20 hover:bg-primary/10"
            }`}
          >
            {isSaved ? <BookmarkCheck className="h-3 w-3" /> : <Bookmark className="h-3 w-3" />}
            {isSaved ? "Saved" : "Save"}
          </button>
        </span>
      )}
    </span>
  );
}
