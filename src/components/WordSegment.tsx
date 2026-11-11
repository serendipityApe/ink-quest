"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Bookmark, BookmarkCheck, Volume2, X } from "lucide-react";
import { useTranslations } from "@/i18n/I18nProvider";
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
  /** Allow pronunciation-only help while generated definitions are pending. */
  learningEnabled?: boolean;
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
  learningEnabled = true,
}: WordSegmentProps) {
  const { lang: interfaceLang } = useTranslations();
  const isZh = interfaceLang === "zh";
  const { word, reading, meaning, level, tier: originalTier } = segment;
  const hasReading = Boolean(reading?.trim());
  // Pending definitions may still offer pinyin/pronunciation, including on touch.
  const tier = !learningEnabled && hasReading && originalTier === "base" ? "normal" : originalTier;
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
      let top = canPlaceAbove || !canPlaceBelow
        ? triggerRect.top - tooltipRect.height - gap
        : triggerRect.bottom + gap;
      let left = Math.min(
        Math.max(triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2, viewportPadding),
        window.innerWidth - tooltipRect.width - viewportPadding,
      );
      const article = triggerRef.current.closest("article")?.getBoundingClientRect();
      const sidePlacement = Boolean(article && article.right + 40 + tooltipRect.width <= window.innerWidth - viewportPadding);
      if (article && sidePlacement) {
        left = article.right + 40;
        top = Math.max(viewportPadding, Math.min(triggerRect.top, window.innerHeight - tooltipRect.height - viewportPadding));
      }
      const bridgePadding = 24;
      const bridgeLeft = sidePlacement ? triggerRect.right - 2 : Math.min(triggerRect.left, left) - bridgePadding;
      const bridgeRight = sidePlacement ? left + 2 : Math.max(triggerRect.right, left + tooltipRect.width) + bridgePadding;
      const bridgeWidth = bridgeRight - bridgeLeft;
      const bridgeTop = sidePlacement ? Math.min(top, triggerRect.top) : top < triggerRect.top ? top + tooltipRect.height : triggerRect.bottom;
      const bridgeHeight = sidePlacement ? Math.max(top + tooltipRect.height, triggerRect.bottom) - bridgeTop : Math.abs(top < triggerRect.top
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

  if (tier === "base" || (!learningEnabled && !hasReading)) {
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
      className={`word-interactive relative ${lang === "en" ? "inline" : "inline-block"} ${baseClass} ${hoverClass} ${audioClass}`}
      tabIndex={0}
      role="button"
      aria-expanded={showTooltip}
      aria-label={`${word}: ${isZh ? "查看释义" : "definition"}`}
      onKeyDown={(event) => { if (event.target !== event.currentTarget) return; if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setShowTooltip(!showTooltip); onReveal?.(); } if (event.key === "Escape") hideTooltip(); }}
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
            className={`fixed bottom-24 left-4 right-4 z-50 mx-auto flex max-w-sm flex-col gap-2 rounded-xl border border-rule bg-surface-container-lowest p-4 text-left text-ink shadow-soft pointer-events-auto md:bottom-auto md:right-auto md:left-[var(--tooltip-left)] md:top-[var(--tooltip-top)] md:z-70 md:mx-0 md:w-[260px] md:max-w-[calc(100vw-32px)] ${tooltipPosition ? "md:visible" : "md:invisible"}`}
            style={{
              "--tooltip-top": tooltipPosition ? `${tooltipPosition.top}px` : undefined,
              "--tooltip-left": tooltipPosition ? `${tooltipPosition.left}px` : undefined,
            } as React.CSSProperties}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
          <span className="flex items-center gap-2"><span className="font-reading text-[26px] leading-tight">{word}</span>{reading && <span className="font-body text-sm text-muted">{reading}</span>}<button type="button" onClick={(event) => { event.stopPropagation(); hideTooltip(); triggerRef.current?.focus(); }} className="iq-quiet ml-auto" aria-label={isZh ? "关闭释义" : "Close definition"}><X className="size-4" /></button></span>
          <span className="flex items-center justify-between gap-3 font-body text-sm leading-normal"><span>{meaning}</span>{level && <span className="iq-badge">{level}</span>}</span>
          <span className="mt-2 flex gap-2 font-body">{learningEnabled && <button type="button" onClick={(event) => { event.stopPropagation(); onToggleSave(segment); }} aria-pressed={isSaved} className="iq-secondary flex-1">{isSaved ? <BookmarkCheck className="size-4" /> : <Bookmark className="size-4" />}{isSaved ? (isZh ? "已收藏" : "Saved") : (isZh ? "收藏" : "Save")}</button>}<button type="button" aria-label={`Pronounce ${word}`} disabled={!ttsSupported} onClick={(event) => { event.stopPropagation(); speak(word, lang); }} className="iq-quiet flex-1 disabled:opacity-50"><Volume2 className="size-4" />{isZh ? "播放" : "Play"}</button></span>

          </span>
        </>
      )}
    </span>
  );
}
