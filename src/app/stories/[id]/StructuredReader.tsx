"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Volume2, Square, Lock, Map, Loader2, Play, ChevronRight } from "lucide-react";
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
  const { t, lang } = useTranslations();

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

  // 移动端逐句播放：记录「当前正在播放/加载的句子 key」。mp3 加载有延迟，
  // 点击后立即把该句按钮切到停止图标，避免用户重复点击（与整段朗读按钮一致）。
  const [playingSentence, setPlayingSentence] = useState<string | null>(null);
  const prevPlayingRef = useRef(false);
  // 切换句子时 play() 会先 stop()（isPlaying 瞬间转 false），用此 ref 抑制这次
  // 「假结束」误清高亮；只有真正的播放结束才清除。
  const restartingRef = useRef(false);

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
    setPlayingSentence(null);
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
    ? "font-body text-[20px] md:text-[22px] text-ink leading-[1.85] break-words"
    : "font-reading text-[22px] md:text-[26px] text-ink break-words tracking-[0.045em] leading-[2]";

  const handleAudio = () => {
    if (!node) return;
    if (isPlaying) { stop(); return; }
    setPlayingSentence(null);
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

    const rangeStart = timestamps[start]?.start ?? 0;
    const rangeTimestamps = timestamps.slice(start, end + 1).map((timestamp) => ({
      start: timestamp.start - rangeStart,
      end: timestamp.end - rangeStart,
    }));

    play({
      audioUrl: null,
      text: joinSegments(segments.slice(start, end + 1), manifest.target_lang),
      timestamps: rangeTimestamps,
      voices,
      lang: manifest.target_lang,
      segmentOffset: start,
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

  const sentenceKey = (start: number, end: number) => `${start}-${end}`;

  // 移动端逐句按钮：点击切换播放/停止。播放时按钮立刻变停止图标（mp3 加载有延迟，
  // 防重复点击），与整段朗读按钮行为一致。
  const handleSentenceToggle = (start: number, end: number) => {
    const key = sentenceKey(start, end);
    if (playingSentence === key) {
      stop();
      setPlayingSentence(null);
      return;
    }
    // 仅当此刻确有音频在播时，play() 内部的 stop() 才会产生一次 isPlaying:true→false 的
    // 「假结束」需要抑制；空闲态点击不会有这次跳变，置 false 以免误吞之后真正的结束事件。
    restartingRef.current = isPlaying;
    setPlayingSentence(key);
    playSegmentRange(start, end);
  };

  // 同步真实播放结束 → 清除句子高亮。切句产生的「假结束」由 restartingRef 跳过一次。
  useEffect(() => {
    if (isPlaying) {
      prevPlayingRef.current = true;
      return;
    }
    if (prevPlayingRef.current) {
      if (restartingRef.current) restartingRef.current = false;
      else setPlayingSentence(null);
    }
    prevPlayingRef.current = false;
  }, [isPlaying]);

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

  const primaryTitle = manifest.target_lang === "zh" ? manifest.title_cn : manifest.title_en;

  return (
    <>
      <Navbar variant="reader" readerTitle={primaryTitle} readerLevel={manifest.level} />
      <main className="flex-grow bg-paper pb-14 md:pb-20">
        {resumed && (
          <div className="fixed top-20 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-ink bg-accent px-4 py-2 font-outlier text-xs shadow-[0_2px_0_var(--color-ink)]">
            <Map className="h-3.5 w-3.5" />
            {t("reader.resumed")}
          </div>
        )}
        <div className="hallmark-shell pt-7 md:pt-10">
        <div className="mx-auto w-full max-w-3xl">
        <article
          ref={articleRef}
          className={`relative min-h-[18rem] w-full py-8 md:py-12 ${mobileSentenceModeEnabled ? "select-none md:select-text" : ""}`}
        >
          {node ? (
            <div className={bodyClass}>
              <div className={mobileSentenceModeEnabled ? "hidden md:block" : "block"}>
                <p>{segments.map((seg, i) => renderSegment(seg, i, i === 0))}</p>
              </div>
              {mobileSentenceModeEnabled && (
                <div className={mobileSentenceBreaksEnabled ? "flex flex-col gap-5 md:hidden" : "inline md:hidden"}>
                  {sentenceGroups.map((sentence) => {
                    const key = sentenceKey(sentence.start, sentence.end);
                    const active = playingSentence === key;
                    return (
                    <p key={key} className={mobileSentenceBreaksEnabled ? "block" : "inline"}>
                      <span>
                        {sentence.segments.map((seg, offset) =>
                          renderSegment(seg, sentence.start + offset, offset === 0)
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleSentenceToggle(sentence.start, sentence.end)}
                        aria-label={active ? "Stop playback" : "Play current sentence"}
                        className={`ml-2 inline-flex size-9 translate-y-1 items-center justify-center rounded-full border border-ink transition-colors ${active ? "bg-accent text-ink" : "bg-accent-soft text-ink hover:bg-accent"}`}
                      >
                        {active ? <Square className="h-4 w-4 fill-primary" /> : <Volume2 className="h-4 w-4" />}
                      </button>
                      {!mobileSentenceBreaksEnabled && " "}
                    </p>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 py-12 text-muted">
              {nodeError && nodeError !== "premium" ? (
                <span className="font-ui-body text-sm">{t("reader.loadError")}</span>
              ) : (
                <Loader2 className="h-6 w-6 animate-spin" />
              )}
            </div>
          )}

          <div className="mt-10 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleAudio}
              disabled={!node}
              className={`inline-flex min-h-11 items-center gap-2 cursor-pointer rounded-full border border-ink px-4 text-sm font-bold whitespace-nowrap transition-transform duration-150 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 ${isPlaying ? "bg-ink text-paper" : "bg-paper hover:bg-accent-soft"}`}
            >
              {isPlaying ? <Square className="size-4 fill-current" /> : <Volume2 className="size-4" />}
              <span>{isPlaying ? t("reader.stopListen") : t("reader.listen")}</span>
            </button>
            <button
              type="button"
              onClick={() => setIsMapOpen(true)}
              className="inline-flex min-h-11 items-center gap-2 cursor-pointer rounded-full border border-ink bg-paper px-4 text-sm font-bold whitespace-nowrap transition-transform duration-150 hover:bg-accent-soft active:translate-y-px"
            >
              <Map className="size-4" /> {t("reader.map")}
            </button>
          </div>

        </article>

        <section className="flex w-full flex-col pt-2">
          <h2 className="mb-2 text-sm font-bold text-ink-2">{lang === "zh" ? "接下来" : "Next"}</h2>
          {(node?.choices ?? manifest.nodes[currentNodeId]?.choices ?? []).map((choice, i) => {
            const choiceLabel = splitChoiceLabel(choice.text, i);

            return (
              <button
                key={i}
                onClick={() => handleChoiceClick(choice.next_node_id)}
                disabled={nodeLoading}
                className="group relative flex min-h-[4rem] w-full cursor-pointer items-center border-b border-rule bg-paper px-1 py-3 text-left disabled:cursor-wait disabled:opacity-50"
              >
                <span className="relative z-10 inline-grid grid-cols-[1.75rem_minmax(0,1fr)] items-center gap-3 font-body font-bold leading-snug">
                  <span className="inline-flex size-7 items-center justify-center rounded-full border border-ink bg-accent-soft font-outlier text-xs leading-none transition-[background-color,transform] duration-150 group-hover:bg-accent group-active:translate-y-px">
                    {choiceLabel.label}
                  </span>
                  <span className="text-left">{choiceLabel.text}</span>
                </span>
                {choice.premium && <Lock className="relative z-10 ml-auto size-4 shrink-0" />}
                <ChevronRight aria-hidden="true" className="ml-auto size-5 -translate-x-1 text-muted opacity-0 transition-[opacity,transform] duration-150 group-hover:translate-x-0 group-hover:opacity-100" />
              </button>
            );
          })}
        </section>
        </div>
        </div>
      </main>

      {/* 划词浮动按钮：选区上方 8px，居中。fixed 定位，scroll 时跟随选区（hook 已用 scrollY 算过）。 */}
      {selRange && selAnchor && (
        <button
          onClick={handlePlaySelection}
          aria-label="Play selected sentence"
          className="absolute z-50 flex -translate-x-1/2 -translate-y-full cursor-pointer items-center gap-1.5 rounded-full border-2 border-ink bg-accent px-3 py-1.5 font-outlier text-xs shadow-[0_3px_0_var(--color-ink)]"
          style={{ top: `${selAnchor.top - 8}px`, left: `${selAnchor.left}px` }}
        >
          <Play className="h-3 w-3 fill-current" />
          {t("reader.playSentence")}
        </button>
      )}

      <Footer variant="reader" backLabel={t("reader.backToLibrary")} />
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
