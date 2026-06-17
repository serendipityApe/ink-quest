"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Volume2, Square, Lock, Map, Loader2, Play, CirclePlay } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SubscribeModal from "@/components/SubscribeModal";
import WordSegment from "@/components/WordSegment";
import StoryMap from "@/components/StoryMap";
import { useAudioSync } from "@/hooks/useAudioSync";
import { useSentenceSelection } from "@/hooks/useSentenceSelection";
import {
  loadSavedWords,
  toggleSaved,
  fromSegment,
  type SavedWord,
} from "@/lib/savedWords";
import {
  getReadingPosition,
  setReadingPosition,
  clearReadingPosition,
} from "@/lib/progress";
import { useTranslations } from "@/i18n/I18nProvider";
import type { StoryManifest, StoryNodeResponse, TextSegment } from "@/types/story";

interface Props {
  storyId: string;
  manifest: StoryManifest;
  /** SSR 已注入的起始节点内容；首屏直接渲染，无 loading。 */
  startNode: StoryNodeResponse;
}

const READER_INTERACTION_CONFIG = {
  /** 移动端按整句渲染，避免逐词 hover/划词交互干扰阅读。 */
  mobileSentenceMode: true,
  /** 移动端每句单独成行，方便点击句尾播放。 */
  mobileSentenceBreaks: true,
};

interface SentenceGroup {
  start: number;
  end: number;
  segments: TextSegment[];
}

const EMPTY_SEGMENTS: TextSegment[] = [];
const EMPTY_TIMESTAMPS: StoryNodeResponse["timestamps"] = [];

function shouldPrefixSpace(word: string, lang: StoryManifest["target_lang"], isFirst: boolean) {
  return lang === "en" && !isFirst && !/^[.,!?:;)]/.test(word);
}

function joinSegments(segments: TextSegment[], lang: StoryManifest["target_lang"]) {
  return segments.reduce((text, seg, index) => {
    const space = shouldPrefixSpace(seg.word, lang, index === 0) ? " " : "";
    return `${text}${space}${seg.word}`;
  }, "");
}

function toSentenceGroups(segments: TextSegment[]) {
  const groups: SentenceGroup[] = [];
  let start = 0;

  segments.forEach((seg, index) => {
    if (/[.!?。！？…]$/.test(seg.word) || index === segments.length - 1) {
      groups.push({ start, end: index, segments: segments.slice(start, index + 1) });
      start = index + 1;
    }
  });

  return groups;
}

function splitChoiceLabel(text: string, index: number) {
  const fallbackLabel = String.fromCharCode(65 + index);
  const match = text.match(/^([A-Z])(?:[.、．]\s*|\s+)(.+)$/);

  return {
    label: match?.[1] ?? fallbackLabel,
    text: match?.[2] ?? text,
  };
}

/**
 * 结构化故事阅读器。
 * 首屏由 Server Component 喂入 manifest + start 节点（HTML 自带正文）；
 * 后续节点跳转才走 /api/stories/[id]/nodes/[nodeId]（按需 + 鉴权 + 内存缓存）。
 *
 * 划词播放：用户在正文区拖选若干词 → 浮动按钮，点击后扩展到完整句子并按
 * timestamps 时间切片播放音频；无音频文件时回退 TTS（无切片）。
 */
export default function StructuredReader({ storyId, manifest, startNode }: Props) {
  const router = useRouter();
  const { t } = useTranslations();

  const [currentNodeId, setCurrentNodeId] = useState<string>(manifest.start_node_id);
  const [isSubscribeOpen, setIsSubscribeOpen] = useState(false);
  const [savedWords, setSavedWords] = useState<SavedWord[]>([]);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [visited, setVisited] = useState<string[]>([manifest.start_node_id]);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [resumed, setResumed] = useState(false);
  const [selectionEnabled, setSelectionEnabled] = useState(!READER_INTERACTION_CONFIG.mobileSentenceMode);

  const [nodeCache, setNodeCache] = useState<Record<string, StoryNodeResponse>>({
    [manifest.start_node_id]: startNode,
  });
  const [nodeLoading, setNodeLoading] = useState(false);
  const [nodeError, setNodeError] = useState<string | null>(null);

  const lastGoodNodeRef = useRef<string>(manifest.start_node_id);
  const { isPlaying, activeSegmentIndex, play, stop } = useAudioSync();

  const mobileSentenceModeEnabled = READER_INTERACTION_CONFIG.mobileSentenceMode;
  const mobileSentenceBreaksEnabled = mobileSentenceModeEnabled && READER_INTERACTION_CONFIG.mobileSentenceBreaks;

  // 划词选择
  const articleRef = useRef<HTMLDivElement>(null);
  const { range: selRange, anchor: selAnchor, clear: clearSelection } =
    useSentenceSelection(articleRef, selectionEnabled);

  // 已保存词的快速查询集合（避免每个 segment 都 includes）
  const savedSet = useMemo(() => new Set(savedWords.map((w) => w.word)), [savedWords]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const updateSelectionEnabled = () => {
      setSelectionEnabled(!READER_INTERACTION_CONFIG.mobileSentenceMode || !mediaQuery.matches);
    };
    updateSelectionEnabled();
    mediaQuery.addEventListener("change", updateSelectionEnabled);

    return () => mediaQuery.removeEventListener("change", updateSelectionEnabled);
  }, []);

  useEffect(() => {
    setSavedWords(loadSavedWords());

    const v = localStorage.getItem(`cm_visited_${storyId}`);
    if (v) {
      const parsed: string[] = JSON.parse(v);
      setVisited(parsed.includes(manifest.start_node_id) ? parsed : [manifest.start_node_id, ...parsed]);
    }

    localStorage.setItem(`cm_total_${storyId}`, String(manifest.node_count));

    const savedPos = getReadingPosition(storyId);
    if (savedPos && savedPos !== manifest.start_node_id && manifest.nodes[savedPos]) {
      setCurrentNodeId(savedPos);
      setResumed(true);
    }

    if (typeof window !== "undefined" && window.speechSynthesis) {
      const loadVoices = () => setVoices(window.speechSynthesis.getVoices());
      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, [storyId, manifest]);

  useEffect(() => {
    if (!resumed) return;
    const tid = setTimeout(() => setResumed(false), 2500);
    return () => clearTimeout(tid);
  }, [resumed]);

  const markVisited = useCallback((nodeId: string) => {
    setVisited((prev) => {
      if (prev.includes(nodeId)) return prev;
      const updated = [...prev, nodeId];
      localStorage.setItem(`cm_visited_${storyId}`, JSON.stringify(updated));
      return updated;
    });
  }, [storyId]);

  const fetchNode = useCallback(
    async (nodeId: string) => {
      if (nodeCache[nodeId]) return;
      setNodeLoading(true);
      setNodeError(null);
      try {
        const res = await fetch(`/api/stories/${storyId}/nodes/${nodeId}`);
        if (res.status === 403) {
          setNodeError("premium");
          setIsSubscribeOpen(true);
          setCurrentNodeId((prev) => {
            const fallback = lastGoodNodeRef.current;
            if (fallback && fallback !== nodeId) {
              setReadingPosition(storyId, fallback);
              return fallback;
            }
            return prev;
          });
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: StoryNodeResponse = await res.json();
        setNodeCache((prev) => ({ ...prev, [nodeId]: data }));
        lastGoodNodeRef.current = nodeId;
        markVisited(nodeId);
      } catch {
        setNodeError("loadError");
      } finally {
        setNodeLoading(false);
      }
    },
    [storyId, nodeCache, markVisited]
  );

  useEffect(() => { fetchNode(currentNodeId); }, [currentNodeId, fetchNode]);

  const handleToggleSave = useCallback((seg: TextSegment) => {
    setSavedWords((prev) => toggleSaved(prev, fromSegment(seg, manifest.target_lang)));
  }, [manifest.target_lang]);

  const handleChoiceClick = (nextNodeId: string) => {
    if (nextNodeId === "end_back_to_list") {
      clearReadingPosition(storyId);
      router.push("/stories");
      return;
    }
    setCurrentNodeId(nextNodeId);
    setReadingPosition(storyId, nextNodeId);
    stop();
    clearSelection();
  };

  const handleMapJump = (nodeId: string) => {
    setCurrentNodeId(nodeId);
    setReadingPosition(storyId, nodeId);
    stop();
    setIsMapOpen(false);
    clearSelection();
  };

  const node = nodeCache[currentNodeId] ?? null;
  const segments = node?.text_segments ?? EMPTY_SEGMENTS;
  const timestamps = node?.timestamps ?? EMPTY_TIMESTAMPS;

  const plainText = node ? joinSegments(segments, manifest.target_lang) : "";
  const sentenceGroups = useMemo(() => toSentenceGroups(segments), [segments]);
  const bodyClass = manifest.target_lang === "en"
    ? "font-ui-body text-[20px] md:text-[22px] text-on-surface leading-loose break-words"
    : "font-story-body-cn text-story-body-cn text-on-surface text-justify break-words tracking-wide leading-loose";

  const handleAudio = () => {
    if (!node) return;
    if (isPlaying) { stop(); return; }
    play({
      audioUrl: node.audio_url,
      text: plainText,
      timestamps,
      voices,
      lang: manifest.target_lang,
    });
  };

  const playSegmentRange = useCallback((start: number, end: number) => {
    if (!node) return;

    if (node.audio_url && timestamps[start] && timestamps[end]) {
      play({
        audioUrl: node.audio_url,
        text: "",
        timestamps,
        voices,
        lang: manifest.target_lang,
        startMs: timestamps[start].start,
        endMs: timestamps[end].end,
      });
      return;
    }

    play({
      audioUrl: null,
      text: joinSegments(segments.slice(start, end + 1), manifest.target_lang),
      timestamps: [],
      voices,
      lang: manifest.target_lang,
    });
  }, [node, timestamps, voices, manifest.target_lang, play, segments]);

  // ── 划词播放：只播放用户选中的那几段，不扩到整句 ──────────────────────
  const handlePlaySelection = () => {
    if (!selRange) return;
    const [a, b] = selRange;
    if (a < 0 || b < 0 || a >= segments.length) return;

    playSegmentRange(a, b);
    clearSelection();
  };

  const renderSegment = (seg: TextSegment, index: number, isFirst: boolean) => {
    const space = shouldPrefixSpace(seg.word, manifest.target_lang, isFirst) ? " " : "";
    return (
      <span key={index} data-seg-index={index}>
        {space}
        <WordSegment
          segment={seg}
          index={index}
          isAudioActive={activeSegmentIndex === index}
          lang={manifest.target_lang}
          isSaved={savedSet.has(seg.word)}
          onToggleSave={handleToggleSave}
        />
      </span>
    );
  };

  return (
    <>
      <Navbar onSubscribeClick={() => setIsSubscribeOpen(true)} />
      <main className="flex-grow flex flex-col items-center justify-center md:pt-24 md:pb-section-gap md:px-reading-inset max-w-container-max mx-auto w-full relative z-10 min-h-[60vh]">
        {resumed && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-40 bg-primary text-white px-4 py-2 rounded-full shadow-lg font-ui-pinyin-sm text-xs flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-300">
            <Map className="h-3.5 w-3.5" />
            {t("reader.resumed")}
          </div>
        )}
        <button
          onClick={() => setIsMapOpen(true)}
          aria-label="View story path map"
          className="absolute top-24 right-reading-inset hidden md:flex items-center gap-2 text-primary opacity-70 hover:opacity-100 transition-opacity py-2 px-4 rounded-full border border-primary/20 bg-primary/5 hover:bg-primary/10 cursor-pointer z-20"
        >
          <Map className="h-4 w-4" />
          <span className="font-ui-pinyin-sm text-xs uppercase tracking-wider">{t("reader.map")}</span>
        </button>
        <article
          ref={articleRef}
          className={`w-full max-w-2xl relative mb-0 md:mb-16 p-8 md:p-12 rounded-2xl min-h-[180px] md:text-justify ${mobileSentenceModeEnabled ? "select-none md:select-text" : ""}`}
        >
          <button
            onClick={handleAudio}
            aria-label="Play audio narration"
            disabled={!node}
            className={`absolute -left-16 top-10 text-primary opacity-60 hover:opacity-100 transition-opacity p-3 rounded-full bg-surface-container/30 hover:bg-surface-container/70 hidden md:flex items-center justify-center disabled:opacity-20 ${isPlaying ? "animate-pulse opacity-100 bg-primary/10" : ""}`}
          >
            {isPlaying ? <Square className="h-5 w-5 fill-primary" /> : <Volume2 className="h-5 w-5" />}
          </button>

          {node ? (
            <div className={bodyClass}>
              <div className={mobileSentenceModeEnabled ? "hidden md:block" : "block"}>
                <p>{segments.map((seg, i) => renderSegment(seg, i, i === 0))}</p>
              </div>
              {mobileSentenceModeEnabled && (
                <div className={mobileSentenceBreaksEnabled ? "flex flex-col gap-5 md:hidden" : "inline md:hidden"}>
                  {sentenceGroups.map((sentence) => (
                    <p key={`${sentence.start}-${sentence.end}`} className={mobileSentenceBreaksEnabled ? "block" : "inline"}>
                      <span>
                        {sentence.segments.map((seg, offset) =>
                          renderSegment(seg, sentence.start + offset, offset === 0)
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={() => playSegmentRange(sentence.start, sentence.end)}
                        aria-label="Play current sentence"
                        className="ml-2 inline-flex h-7 w-7 translate-y-1 items-center justify-center rounded-full bg-primary/8 text-primary transition-colors active:scale-95 hover:bg-primary/15"
                      >
                        <CirclePlay className="h-4 w-4" />
                      </button>
                      {!mobileSentenceBreaksEnabled && " "}
                    </p>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center py-12 text-secondary gap-2">
              {nodeError && nodeError !== "premium" ? (
                <span className="font-ui-body text-sm">{t("reader.loadError")}</span>
              ) : (
                <Loader2 className="h-6 w-6 animate-spin" />
              )}
            </div>
          )}

          <div className="mt-8 flex items-center justify-end gap-3 md:hidden">
            <button
              onClick={handleAudio}
              aria-label="Play audio narration"
              disabled={!node}
              className={`text-primary opacity-60 hover:opacity-100 transition-opacity p-2 border border-primary/20 rounded-full flex items-center gap-2 disabled:opacity-20 ${isPlaying ? "bg-primary/10 opacity-100" : "bg-primary/5"}`}
            >
              {isPlaying ? <Square className="h-4 w-4 fill-primary" /> : <Volume2 className="h-4 w-4" />}
              <span className="font-ui-pinyin-sm text-xs uppercase tracking-wider">
                {isPlaying ? t("reader.stopListen") : t("reader.listen")}
              </span>
            </button>
            <button
              onClick={() => setIsMapOpen(true)}
              aria-label="View story path map"
              className="text-primary opacity-60 hover:opacity-100 transition-opacity p-2 border border-primary/20 rounded-full flex items-center gap-2 bg-primary/5"
            >
              <Map className="h-4 w-4" />
              <span className="font-ui-pinyin-sm text-xs uppercase tracking-wider">{t("reader.map")}</span>
            </button>
          </div>
        </article>

        <section className="w-full max-w-md flex flex-col gap-4 mt-0 md:mt-6 p-8 md:p-0">
          {(node?.choices ?? manifest.nodes[currentNodeId]?.choices ?? []).map((choice, i) => {
            const choiceLabel = splitChoiceLabel(choice.text, i);

            return (
              <button
                key={i}
                onClick={() => handleChoiceClick(choice.next_node_id)}
                disabled={nodeLoading}
                className="group w-full min-h-[68px] md:min-h-0 px-4 md:px-0 py-3 md:py-4 text-center relative overflow-hidden transition-all duration-300 rounded-md md:rounded-lg border border-primary/20 md:border-0 cursor-pointer active:scale-98 disabled:opacity-50 disabled:cursor-wait flex items-center justify-center"
              >
                <span className={`relative z-10 inline-grid grid-cols-[1.75rem_minmax(0,16rem)] items-start gap-4 font-button-text text-button-text uppercase tracking-widest leading-snug md:leading-none transition-colors ${choice.premium ? "text-primary/70 group-hover:text-primary" : "text-secondary group-hover:text-primary"}`}>
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-primary/20 bg-primary/5 text-primary text-[11px] leading-none">
                    {choiceLabel.label}
                  </span>
                  <span className="text-left">{choiceLabel.text}</span>
                </span>
                {choice.premium && <Lock className="h-3.5 w-3.5 text-primary ml-2 inline-block shrink-0 relative z-10" />}
                <div className="absolute inset-x-0 bottom-0 hidden md:block h-[1px] bg-secondary-fixed/50 group-hover:bg-primary/30 transition-colors" />
                <div className="absolute inset-0 bg-primary/5 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out z-0" />
              </button>
            );
          })}
        </section>
      </main>

      {/* 划词浮动按钮：选区上方 8px，居中。fixed 定位，scroll 时跟随选区（hook 已用 scrollY 算过）。 */}
      {selRange && selAnchor && (
        <button
          onClick={handlePlaySelection}
          aria-label="Play selected sentence"
          className="absolute z-50 -translate-x-1/2 -translate-y-full bg-primary text-white px-3 py-1.5 rounded-full shadow-lg font-ui-pinyin-sm text-xs flex items-center gap-1.5 cursor-pointer hover:bg-primary/90 transition-colors animate-in fade-in zoom-in-95 duration-150"
          style={{ top: `${selAnchor.top - 8}px`, left: `${selAnchor.left}px` }}
        >
          <Play className="h-3 w-3 fill-white" />
          {t("reader.playSentence")}
        </button>
      )}

      <Footer />
      <SubscribeModal isOpen={isSubscribeOpen} onClose={() => setIsSubscribeOpen(false)} />
      {isMapOpen && (
        <StoryMap
          storyId={storyId}
          manifest={manifest}
          currentNodeId={currentNodeId}
          visited={visited}
          onJump={handleMapJump}
          onClose={() => setIsMapOpen(false)}
        />
      )}
    </>
  );
}
