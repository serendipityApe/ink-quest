"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Bookmark, BookmarkCheck, Volume2 } from "lucide-react";
import type { TextSegment } from "@/types/story";
import { useSpeak } from "@/hooks/useSpeak";

interface WordSegmentProps {
  segment: TextSegment;
  index: number;
  isAudioActive: boolean;
  /** 词所属故事的目标语言；用于 TTS 选 voice。 */
  lang: "zh" | "en";
  isSaved: boolean;
  onToggleSave: (seg: TextSegment) => void;
  onReveal?: () => void;
}

interface TooltipPosition {
  top: number;
  left: number;
  bridgeTop: number;
  bridgeLeft: number;
  bridgeWidth: number;
  bridgeHeight: number;
}

export default function WordSegment({
  segment,
  isAudioActive,
  lang,
  isSaved,
  onToggleSave,
  onReveal,
}: WordSegmentProps) {
  const { word, reading, meaning, level, tier } = segment;
  const [showTooltip, setShowTooltip] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState<TooltipPosition | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const tooltipRef = useRef<HTMLSpanElement | null>(null);
  const { speak, supported: ttsSupported } = useSpeak();

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const hideTooltip = useCallback(() => {
    clearTimer();
    setIsHovering(false);
    setShowTooltip(false);
    setTooltipPosition(null);
  }, [clearTimer]);

  const canHover = useCallback(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  }, []);

  const showNormalTooltip = useCallback(() => {
    clearTimer();
    setIsHovering(true);
    setShowTooltip(true);
    onReveal?.();
  }, [clearTimer, onReveal]);

  const cancelMobilePress = useCallback(() => {
    if (canHover()) return;
    clearTimer();
    if (!showTooltip) setIsHovering(false);
  }, [canHover, clearTimer, showTooltip]);

  const handleMouseEnter = useCallback(() => {
    if (tier === "base" || !canHover()) return;
    setIsHovering(true);
    if (tier === "key") {
      setShowTooltip(true);
      onReveal?.();
    } else {
      // normal: wait for underline animation to complete (700ms)
      timerRef.current = setTimeout(() => setShowTooltip(true), 700);
    }
  }, [tier, canHover, onReveal]);

  const handleMouseLeave = useCallback((e: React.MouseEvent<HTMLSpanElement>) => {
    if (tier === "base" || !canHover()) return;
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    hideTooltip();
  }, [tier, canHover, hideTooltip]);

  const handleClick = useCallback(() => {
    if (tier === "key") {
      clearTimer();
      setShowTooltip(true);
      onReveal?.();
    }
  }, [tier, clearTimer, onReveal]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLSpanElement>) => {
    if (tier === "base" || e.pointerType === "mouse") return;
    e.preventDefault();
    clearTimer();
    setIsHovering(true);
    if (tier === "key") {
      setShowTooltip(true);
      onReveal?.();
      return;
    }
    timerRef.current = setTimeout(showNormalTooltip, 500);
  }, [tier, clearTimer, showNormalTooltip, onReveal]);

  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLSpanElement>) => {
    if (!canHover()) e.preventDefault();
  }, [canHover]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  useEffect(() => {
    if (!showTooltip) return;

    const updateTooltipPosition = () => {
      if (!canHover() || !triggerRef.current || !tooltipRef.current) return;

      const triggerRect = triggerRef.current.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();
      const gap = 8;
      const viewportPadding = 8;
      const canPlaceAbove = triggerRect.top - tooltipRect.height - gap >= viewportPadding;
      const canPlaceBelow = triggerRect.bottom + tooltipRect.height + gap <= window.innerHeight - viewportPadding;
      const top = canPlaceAbove || !canPlaceBelow
        ? triggerRect.top - tooltipRect.height - gap
        : triggerRect.bottom + gap;
      const left = Math.min(
        Math.max(triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2, viewportPadding),
        window.innerWidth - tooltipRect.width - viewportPadding,
      );
      const bridgePadding = 24;
      const bridgeLeft = Math.min(triggerRect.left, left) - bridgePadding;
      const bridgeRight = Math.max(triggerRect.right, left + tooltipRect.width) + bridgePadding;
      const bridgeWidth = bridgeRight - bridgeLeft;
      const bridgeTop = top < triggerRect.top ? top + tooltipRect.height : triggerRect.bottom;
      const bridgeHeight = Math.abs(top < triggerRect.top
        ? triggerRect.top - bridgeTop
        : top - triggerRect.bottom);

      setTooltipPosition({ top, left, bridgeTop, bridgeLeft, bridgeWidth, bridgeHeight });
    };

    updateTooltipPosition();
    window.addEventListener("resize", updateTooltipPosition);
    window.addEventListener("scroll", updateTooltipPosition, true);

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (target && tooltipRef.current?.contains(target)) {
        e.stopPropagation();
        return;
      }
      hideTooltip();
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("resize", updateTooltipPosition);
      window.removeEventListener("scroll", updateTooltipPosition, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [showTooltip, hideTooltip, canHover]);

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
      ref={triggerRef}
      className={`word-interactive relative inline-block ${baseClass} ${hoverClass} ${audioClass}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerUp={cancelMobilePress}
      onPointerCancel={cancelMobilePress}
      onContextMenu={handleContextMenu}
    >
      {word}

      {showTooltip && (
        <>
          <span
            className="fixed inset-0 z-40 md:hidden"
            onPointerDown={hideTooltip}
            onClick={(e) => e.stopPropagation()}
          />
          {tooltipPosition && (
            <span
              aria-hidden="true"
              className="fixed z-[69] hidden pointer-events-auto md:block"
              style={{
                top: `${tooltipPosition.bridgeTop}px`,
                left: `${tooltipPosition.bridgeLeft}px`,
                width: `${tooltipPosition.bridgeWidth}px`,
                height: `${tooltipPosition.bridgeHeight}px`,
              }}
            />
          )}
          <span
            ref={tooltipRef}
            className={`fixed bottom-6 left-4 right-4 z-50 mx-auto flex max-w-sm flex-col gap-1.5 rounded-card border-2 border-ink bg-paper px-4 py-3 text-center shadow-[0.4rem_0.4rem_0_var(--color-ink)] pointer-events-auto md:bottom-auto md:right-auto md:left-[var(--tooltip-left)] md:top-[var(--tooltip-top)] md:z-70 md:mx-0 md:min-w-[180px] md:max-w-none ${tooltipPosition ? "md:visible" : "md:invisible"}`}
            style={{
              "--tooltip-top": tooltipPosition ? `${tooltipPosition.top}px` : undefined,
              "--tooltip-left": tooltipPosition ? `${tooltipPosition.left}px` : undefined,
            } as React.CSSProperties}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
          {/* 读音行：拼音/IPA + 喇叭按钮（TTS）。即便 reading 为空也保留按钮，
              确保任何带释义/级别的词都能听到读音。 */}
          <span className="flex items-center justify-center gap-2">
            {reading && (
              <span className="font-outlier text-sm font-medium text-ink-2">
                {reading}
              </span>
            )}
            {ttsSupported && (
              <button
                onClick={(e) => { e.stopPropagation(); speak(word, lang); }}
                aria-label={`Pronounce ${word}`}
                className="grid size-9 place-items-center rounded-full border border-ink bg-accent-soft hover:bg-accent"
              >
                <Volume2 className="h-3.5 w-3.5" />
              </button>
            )}
          </span>
          {meaning && (
            <span className="block whitespace-normal font-body text-sm text-ink-2">{meaning}</span>
          )}
          {level && (
            <span className="mx-auto inline-block rounded-full border border-ink px-2 py-0.5 font-outlier text-[10px] uppercase tracking-wider">
              {level}
            </span>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onToggleSave(segment); }}
            className={`mt-1.5 flex min-h-10 cursor-pointer items-center justify-center gap-1.5 rounded-full border-2 border-ink px-3 py-1 font-body text-[11px] font-bold uppercase tracking-wider ${
              isSaved
                ? "bg-accent text-ink"
                : "bg-paper-2 text-ink hover:bg-accent-soft"
            }`}
          >
            {isSaved ? <BookmarkCheck className="h-3 w-3" /> : <Bookmark className="h-3 w-3" />}
            {isSaved ? "Saved" : "Save"}
          </button>
          </span>
        </>
      )}
    </span>
  );
}
