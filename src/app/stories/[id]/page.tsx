"use client";

import { use, useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Volume2, Square, Lock, Map, Loader2 } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SubscribeModal from "@/components/SubscribeModal";
import WordSegment from "@/components/WordSegment";
import StoryMap from "@/components/StoryMap";
import { useAudioSync } from "@/hooks/useAudioSync";
import { STORY_REGISTRY } from "@/data/stories";
import {
  getReadingPosition,
  setReadingPosition,
  clearReadingPosition,
} from "@/lib/progress";
import { useTranslations } from "@/i18n/I18nProvider";
import type { StoryManifest, StoryNodeResponse } from "@/types/story";

// 故事走结构化（API 按需加载）还是 legacy（本地 STORY_REGISTRY）由服务端单一数据源决定：
// 进页探测 /api/stories/[id]，200 → 结构化，404 → legacy。避免客户端再维护一份 id 列表。
type StoryMode = "probing" | "structured" | "legacy";

export default function StoryReader({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const storyId = resolvedParams.id;
  const router = useRouter();
  const { t } = useTranslations();

  const [currentNodeId, setCurrentNodeId] = useState("start");
  const [isSubscribeOpen, setIsSubscribeOpen] = useState(false);
  const [savedWords, setSavedWords] = useState<string[]>([]);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [visited, setVisited] = useState<string[]>(["start"]);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [resumed, setResumed] = useState(false); // 是否从续读位置恢复（用于轻提示）

  // 故事类型：探测前为 probing
  const [storyMode, setStoryMode] = useState<StoryMode>("probing");

  // 结构化故事：清单 + 按需加载的节点（内存缓存）
  const [manifest, setManifest] = useState<StoryManifest | null>(null);
  const [nodeCache, setNodeCache] = useState<Record<string, StoryNodeResponse>>({});
  const [nodeLoading, setNodeLoading] = useState(false);
  const [nodeError, setNodeError] = useState<string | null>(null);

  // Legacy fallback state
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

  // 最近一个成功加载的节点（付费 403 时回退用）
  const lastGoodNodeRef = useRef<string>("start");

  const { isPlaying, activeSegmentIndex, play, stop } = useAudioSync();

  const isStructured = storyMode === "structured";

  useEffect(() => {
    const saved = localStorage.getItem("cm_saved_words");
    if (saved) setSavedWords(JSON.parse(saved));

    const v = localStorage.getItem(`cm_visited_${storyId}`);
    if (v) {
      const parsed: string[] = JSON.parse(v);
      setVisited(parsed.includes("start") ? parsed : ["start", ...parsed]);
    }

    if (typeof window !== "undefined" && window.speechSynthesis) {
      const loadVoices = () => setVoices(window.speechSynthesis.getVoices());
      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, [storyId]);

  // 探测故事类型 + 拉取清单（结构化）。404 回退 legacy（本地 STORY_REGISTRY）。
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/stories/${storyId}`)
      .then(async (r) => {
        if (cancelled) return;
        if (r.ok) {
          const m: StoryManifest = await r.json();
          setManifest(m);
          setStoryMode("structured");
          localStorage.setItem(`cm_total_${storyId}`, String(m.node_count));
          // 续读：恢复上次阅读位置（校验该节点在清单中真实存在，否则回退 start）
          const saved = getReadingPosition(storyId);
          if (saved && saved !== m.start_node_id && m.nodes[saved]) {
            setCurrentNodeId(saved);
            setResumed(true);
          }
          return;
        }
        // 非 200：回退 legacy
        setStoryMode("legacy");
        if (STORY_REGISTRY[storyId]) {
          localStorage.setItem(
            `cm_total_${storyId}`,
            String(Object.keys(STORY_REGISTRY[storyId].nodes).length)
          );
          const saved = getReadingPosition(storyId);
          if (saved && saved !== "start" && STORY_REGISTRY[storyId].nodes[saved]) {
            setCurrentNodeId(saved);
            setResumed(true);
          }
        }
      })
      .catch(() => {
        if (!cancelled) setStoryMode("legacy"); // 网络异常时退到 legacy 渲染（含其内部兜底）
      });
    return () => { cancelled = true; };
  }, [storyId]);

  // 续读提示 2.5 秒后淡出
  useEffect(() => {
    if (!resumed) return;
    const t = setTimeout(() => setResumed(false), 2500);
    return () => clearTimeout(t);
  }, [resumed]);

  const markVisited = useCallback((nodeId: string) => {
    setVisited((prev) => {
      if (prev.includes(nodeId)) return prev;
      const updated = [...prev, nodeId];
      localStorage.setItem(`cm_visited_${storyId}`, JSON.stringify(updated));
      return updated;
    });
  }, [storyId]);

  // 按需拉取单个节点内容（已缓存则直接复用）。403 表示付费节点未订阅。
  const fetchNode = useCallback(
    async (nodeId: string) => {
      if (nodeCache[nodeId]) return;
      setNodeLoading(true);
      setNodeError(null);
      try {
        const res = await fetch(`/api/stories/${storyId}/nodes/${nodeId}`);
        if (res.status === 403) {
          // 付费节点未订阅：弹订阅框，并退回上一个可读节点（避免卡在空白付费页）。
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
        markVisited(nodeId); // 内容成功加载才算「已探索」（付费 403 不计入）
      } catch {
        setNodeError("loadError");
      } finally {
        setNodeLoading(false);
      }
    },
    [storyId, nodeCache, markVisited]
  );

  // 当前节点变化时确保其内容已加载
  useEffect(() => {
    if (isStructured && manifest) fetchNode(currentNodeId);
  }, [isStructured, manifest, currentNodeId, fetchNode]);

  const handleSaveWord = (word: string) => {
    const updated = savedWords.includes(word)
      ? savedWords.filter((w) => w !== word)
      : [...savedWords, word];
    setSavedWords(updated);
    localStorage.setItem("cm_saved_words", JSON.stringify(updated));
    localStorage.setItem("savedWordsCount", updated.length.toString());
  };

  const handleChoiceClick = (nextNodeId: string, premium?: boolean) => {
    if (nextNodeId === "end_back_to_list") {
      // 走到结局并点「返回列表」：本条故事线读完，清除续读游标，下次从头开始。
      clearReadingPosition(storyId);
      router.push("/stories");
      return;
    }
    // legacy 故事走纯前端 premium 拦截（无对应 API）
    if (premium && !isStructured) { setIsSubscribeOpen(true); return; }
    setCurrentNodeId(nextNodeId);
    setReadingPosition(storyId, nextNodeId); // 保存续读位置
    // 结构化故事的 visited 在节点内容成功加载后才标记（见 fetchNode），
    // 这样付费 403 的节点不会被误计入进度；legacy 立即标记。
    if (!isStructured) markVisited(nextNodeId);
    setActiveTooltip(null);
    stop();
  };

  // 从路径图跳回某个已访问节点
  const handleMapJump = (nodeId: string) => {
    setCurrentNodeId(nodeId);
    setReadingPosition(storyId, nodeId); // 跳转也更新续读位置
    setActiveTooltip(null);
    stop();
    setIsMapOpen(false);
  };

  // ── Structured rendering ──────────────────────────────────────────────────
  if (isStructured) {
    if (!manifest) {
      return (
        <>
          <Navbar onSubscribeClick={() => setIsSubscribeOpen(true)} />
          <main className="flex-grow flex items-center justify-center min-h-[60vh]">
            {nodeError ? (
              <p className="font-ui-body text-secondary text-sm">{t("reader.loadError")}</p>
            ) : (
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
            )}
          </main>
          <Footer />
        </>
      );
    }

    const node = nodeCache[currentNodeId] ?? null;
    const plainText = node ? node.text_segments.map((s) => s.word).join(manifest.target_lang === "en" ? " " : "") : "";
    // 英文正文用 UI 衬线、词间留空格；中文用中文衬线、字距加宽
    const bodyClass = manifest.target_lang === "en"
      ? "font-ui-body text-[20px] md:text-[22px] text-on-surface leading-loose break-words"
      : "font-story-body-cn text-story-body-cn text-on-surface text-justify break-words tracking-wide leading-loose";

    const handleAudio = () => {
      if (!node) return;
      if (isPlaying) { stop(); return; }
      play({ audioUrl: node.audio_url, text: plainText, timestamps: node.timestamps, voices, lang: manifest.target_lang });
    };

    return (
      <>
        <Navbar onSubscribeClick={() => setIsSubscribeOpen(true)} />
        <main className="flex-grow flex flex-col items-center justify-center pt-24 pb-section-gap px-reading-inset max-w-container-max mx-auto w-full relative z-10 min-h-[60vh]">
          {resumed && (
            <div className="fixed top-20 left-1/2 -translate-x-1/2 z-40 bg-primary text-white px-4 py-2 rounded-full shadow-lg font-ui-pinyin-sm text-xs flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-300">
              <Map className="h-3.5 w-3.5" />
              {t("reader.resumed")}
            </div>
          )}
          <button
            onClick={() => setIsMapOpen(true)}
            aria-label="View story path map"
            className="absolute top-24 right-reading-inset flex items-center gap-2 text-primary opacity-70 hover:opacity-100 transition-opacity py-2 px-4 rounded-full border border-primary/20 bg-primary/5 hover:bg-primary/10 cursor-pointer z-20"
          >
            <Map className="h-4 w-4" />
            <span className="font-ui-pinyin-sm text-xs uppercase tracking-wider hidden sm:inline">{t("reader.map")}</span>
          </button>

          <article className="w-full max-w-2xl relative mb-16 p-8 md:p-12 bg-[#F8F6F1] rounded-2xl border border-surface-container-high/20 shadow-sm min-h-[180px]">
            <button
              onClick={handleAudio}
              aria-label="Play audio narration"
              disabled={!node}
              className={`absolute -left-16 top-10 text-primary opacity-60 hover:opacity-100 transition-opacity p-3 rounded-full bg-surface-container/30 hover:bg-surface-container/70 hidden md:flex items-center justify-center disabled:opacity-20 ${isPlaying ? "animate-pulse opacity-100 bg-primary/10" : ""}`}
            >
              {isPlaying ? <Square className="h-5 w-5 fill-primary" /> : <Volume2 className="h-5 w-5" />}
            </button>

            {node ? (
              <p className={bodyClass}>
                {node.text_segments.map((seg, i) => {
                  // 英文：词间补空格（标点前不加），中文不需要
                  const space =
                    manifest.target_lang === "en" && i > 0 && !/^[.,!?:;]/.test(seg.word)
                      ? " "
                      : "";
                  return (
                    <span key={i}>
                      {space}
                      <WordSegment
                        segment={seg}
                        index={i}
                        isAudioActive={activeSegmentIndex === i}
                        savedWords={savedWords}
                        onSave={handleSaveWord}
                      />
                    </span>
                  );
                })}
              </p>
            ) : (
              <div className="flex items-center justify-center py-12 text-secondary gap-2">
                {nodeError && nodeError !== "premium" ? (
                  <span className="font-ui-body text-sm">{t("reader.loadError")}</span>
                ) : (
                  <Loader2 className="h-6 w-6 animate-spin" />
                )}
              </div>
            )}

            <button
              onClick={handleAudio}
              aria-label="Play audio narration"
              disabled={!node}
              className={`mt-8 text-primary opacity-60 hover:opacity-100 transition-opacity p-2 border border-primary/20 rounded-full flex items-center gap-2 md:hidden disabled:opacity-20 ${isPlaying ? "bg-primary/10 opacity-100" : "bg-primary/5"}`}
            >
              {isPlaying ? <Square className="h-4 w-4 fill-primary" /> : <Volume2 className="h-4 w-4" />}
              <span className="font-ui-pinyin-sm text-xs uppercase tracking-wider">
                {isPlaying ? t("reader.stopListen") : t("reader.listen")}
              </span>
            </button>
          </article>

          <section className="w-full max-w-md flex flex-col gap-4 mt-6">
            {(node?.choices ?? manifest.nodes[currentNodeId]?.choices ?? []).map((choice, i) => (
              <button
                key={i}
                onClick={() => handleChoiceClick(choice.next_node_id, choice.premium)}
                disabled={nodeLoading}
                className="group w-full py-4 text-center relative overflow-hidden transition-all duration-300 rounded-lg cursor-pointer active:scale-98 disabled:opacity-50 disabled:cursor-wait"
              >
                <span className={`font-button-text text-button-text uppercase tracking-widest relative z-10 transition-colors ${choice.premium ? "text-primary/70 group-hover:text-primary" : "text-secondary group-hover:text-primary"}`}>
                  {choice.text}
                </span>
                {choice.premium && <Lock className="h-3.5 w-3.5 text-primary ml-2 inline-block relative z-10" />}
                <div className="absolute inset-x-0 bottom-0 h-[1px] bg-secondary-fixed/50 group-hover:bg-primary/30 transition-colors" />
                <div className="absolute inset-0 bg-primary/5 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out z-0" />
              </button>
            ))}
          </section>
        </main>
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

  // ── 探测中：先显示 loading，避免误闪 legacy 内容 ──────────────────────────
  if (storyMode === "probing") {
    return (
      <>
        <Navbar onSubscribeClick={() => setIsSubscribeOpen(true)} />
        <main className="flex-grow flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 text-primary animate-spin" />
        </main>
        <Footer />
      </>
    );
  }

  // ── Legacy rendering (lost-letter 等旧格式) ──────────────────────────────
  const legacyStory = STORY_REGISTRY[storyId];
  if (!legacyStory) {
    // 既非结构化、本地也无此故事 → 找不到
    return (
      <>
        <Navbar onSubscribeClick={() => setIsSubscribeOpen(true)} />
        <main className="flex-grow flex flex-col items-center justify-center gap-4 min-h-[60vh]">
          <p className="font-ui-body text-secondary">{t("reader.loadError")}</p>
          <button
            onClick={() => router.push("/stories")}
            className="font-button-text text-xs uppercase tracking-widest text-primary border border-primary/30 px-6 py-2.5 rounded-full hover:bg-primary/5 transition-colors cursor-pointer"
          >
            {t("savedWords.browse")}
          </button>
        </main>
        <Footer />
      </>
    );
  }
  const legacyNode = legacyStory.nodes[currentNodeId] || legacyStory.nodes["start"];

  const handleLegacyAudio = () => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    if (isPlaying) { stop(); return; }
    play({ audioUrl: null, text: legacyNode.text, timestamps: [], voices });
  };

  const renderLegacyText = () => {
    const { text, translations } = legacyNode;
    const words = Object.keys(translations).sort((a, b) => b.length - a.length);
    if (words.length === 0) return text;
    const regex = new RegExp(`(${words.map((w) => w.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")).join("|")})`, "g");
    return text.split(regex).map((part, i) => {
      const trans = translations[part];
      if (!trans) return part;
      const isOpen = activeTooltip === part;
      const isSaved = savedWords.includes(part);
      return (
        <span
          key={i}
          className="relative inline-block"
          onMouseEnter={() => setActiveTooltip(part)}
          onMouseLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setActiveTooltip(null); }}
        >
          <span onClick={() => setActiveTooltip(isOpen ? null : part)} className="word-key select-none">{part}</span>
          {isOpen && (
            <span className="absolute bottom-full left-1/2 -translate-x-1/2 pb-3 bg-surface/90 border border-surface-container-high/60 rounded-xl px-4 pt-3 shadow-xl glass-panel text-center flex flex-col gap-1.5 z-30 min-w-[180px] animate-in fade-in slide-in-from-bottom-2 duration-200">
              <span className="font-ui-pinyin-sm text-sm text-secondary font-medium block">{trans.pinyin}</span>
              <span className="font-ui-body text-sm text-on-surface-variant block whitespace-normal">{trans.meaning}</span>
              {trans.level && <span className="text-[10px] uppercase tracking-wider text-primary bg-primary-container/10 px-2 py-0.5 rounded-full inline-block mx-auto">{trans.level}</span>}
            </span>
          )}
        </span>
      );
    });
  };

  return (
    <>
      <Navbar onSubscribeClick={() => setIsSubscribeOpen(true)} />
      <main className="flex-grow flex flex-col items-center justify-center pt-24 pb-section-gap px-reading-inset max-w-container-max mx-auto w-full relative z-10 min-h-[60vh]">
        {resumed && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-40 bg-primary text-white px-4 py-2 rounded-full shadow-lg font-ui-pinyin-sm text-xs flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-300">
            已恢复到上次阅读位置
          </div>
        )}
        <article className="w-full max-w-2xl relative mb-16 p-8 md:p-12 bg-[#F8F6F1] rounded-2xl border border-surface-container-high/20 shadow-sm">
          <button
            onClick={handleLegacyAudio}
            aria-label="Play audio narration"
            className={`absolute -left-16 top-10 text-primary opacity-60 hover:opacity-100 transition-opacity p-3 rounded-full bg-surface-container/30 hover:bg-surface-container/70 hidden md:flex items-center justify-center ${isPlaying ? "animate-pulse opacity-100 bg-primary/10" : ""}`}
          >
            {isPlaying ? <Square className="h-5 w-5 fill-primary" /> : <Volume2 className="h-5 w-5" />}
          </button>
          <p className="font-story-body-cn text-story-body-cn text-on-surface text-justify break-words tracking-wide leading-loose">
            {renderLegacyText()}
          </p>
          <button
            onClick={handleLegacyAudio}
            aria-label="Play audio narration"
            className={`mt-8 text-primary opacity-60 hover:opacity-100 transition-opacity p-2 border border-primary/20 rounded-full flex items-center gap-2 md:hidden ${isPlaying ? "bg-primary/10 opacity-100" : "bg-primary/5"}`}
          >
            {isPlaying ? <Square className="h-4 w-4 fill-primary" /> : <Volume2 className="h-4 w-4" />}
            <span className="font-ui-pinyin-sm text-xs uppercase tracking-wider">
              {isPlaying ? "Stop Listening" : "Listen Narration"}
            </span>
          </button>
        </article>
        <section className="w-full max-w-md flex flex-col gap-4 mt-6">
          {legacyNode.choices.map((choice, i) => (
            <button
              key={i}
              onClick={() => handleChoiceClick(choice.nextNodeId, choice.premium)}
              className="group w-full py-4 text-center relative overflow-hidden transition-all duration-300 rounded-lg cursor-pointer active:scale-98"
            >
              <span className={`font-button-text text-button-text uppercase tracking-widest relative z-10 transition-colors ${choice.premium ? "text-primary/70 group-hover:text-primary" : "text-secondary group-hover:text-primary"}`}>
                {choice.text}
              </span>
              {choice.premium && <Lock className="h-3.5 w-3.5 text-primary ml-2 inline-block relative z-10" />}
              <div className="absolute inset-x-0 bottom-0 h-[1px] bg-secondary-fixed/50 group-hover:bg-primary/30 transition-colors" />
              <div className="absolute inset-0 bg-primary/5 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out z-0" />
            </button>
          ))}
        </section>
      </main>
      <Footer />
      <SubscribeModal isOpen={isSubscribeOpen} onClose={() => setIsSubscribeOpen(false)} />
    </>
  );
}
