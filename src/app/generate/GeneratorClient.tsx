"use client";

/* Hallmark · macrostructure: Workbench · genre: editorial + playful · theme: InkQuest locked system
 * pre-emit critique: P5 H5 E5 S5 R5 V4 · mobile: single-column workbench
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Coins, LockKeyhole, RefreshCw, Sparkles, Square, Volume2 } from "lucide-react";
import Navbar from "@/components/Navbar";
import WordSegment from "@/components/WordSegment";
import { useAudioSync } from "@/hooks/useAudioSync";
import { useTranslations } from "@/i18n/I18nProvider";
import { fromSegment, loadSavedWords, toggleSaved, type SavedWord } from "@/lib/savedWords";
import type { TextSegment, Timestamp } from "@/types/story";

type TargetLanguage = "zh" | "en";
type TtsMode = "off" | "every_scene";
type Phase = "intro" | "generating" | "reader";

interface Quote {
  pricingVersion: string;
  total: number;
  items: Array<{ code: string; credits: number }>;
}

interface StoryChoice {
  id: string;
  label: string;
  intent: string | null;
  risk_hint: string | null;
  selected_at: string | null;
}

interface GeneratedNode {
  id: string;
  text: string | null;
  text_segments: TextSegment[] | null;
  summary: string | null;
  status: string;
  story_choices: StoryChoice[];
}

interface GeneratedStoryResponse {
  story: {
    id: string;
    title: string | null;
    premise: string;
    target_language: TargetLanguage;
    learner_level: string;
    status: string;
    current_node_id: string | null;
    tts_mode: TtsMode;
  };
  nodes: GeneratedNode[];
  jobs: Array<{ id: string; status: string; stage: string; error_message_safe: string | null }>;
  audioAssets: Array<{
    id: string;
    node_id: string;
    duration_ms: number | null;
    timestamps: Timestamp[] | null;
    audio_url: string | null;
  }>;
}

interface SentenceGroup {
  start: number;
  end: number;
  segments: TextSegment[];
  complete: boolean;
}

const OPTIONS = {
  genre: [
    { name: "雾港悬疑", hint: "线索与秘密" },
    { name: "东方奇幻", hint: "异闻与古城" },
    { name: "近未来都市", hint: "技术与选择" },
  ],
  identity: [
    { name: "失忆旅客", hint: "过去是谜" },
    { name: "新手记者", hint: "追问真相" },
    { name: "临时翻译", hint: "听见暗语" },
  ],
  motive: [
    { name: "找回一封不存在的信", hint: "追踪线索" },
    { name: "隐藏一个危险秘密", hint: "守住身份" },
    { name: "完成一场无人见证的交易", hint: "交换筹码" },
  ],
} as const;

type OptionGroup = keyof typeof OPTIONS;

export default function GeneratorClient({ initialStoryId }: { initialStoryId: string | null }) {
  const { lang } = useTranslations();
  const isZh = lang === "zh";
  const [targetLanguage, setTargetLanguage] = useState<TargetLanguage>("zh");
  const [learnerLevel, setLearnerLevel] = useState("HSK 4");
  const [ttsMode, setTtsMode] = useState<TtsMode>("off");
  const [selected, setSelected] = useState<Record<OptionGroup, number>>({ genre: 0, identity: 0, motive: 0 });
  const [customOpen, setCustomOpen] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [phase, setPhase] = useState<Phase>(initialStoryId ? "generating" : "intro");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [pricingError, setPricingError] = useState(false);
  const [error, setError] = useState("");
  const [activeJob, setActiveJob] = useState<{ jobId: string; storyId: string; branch: boolean } | null>(null);
  const [jobStage, setJobStage] = useState("queued");
  const [storyData, setStoryData] = useState<GeneratedStoryResponse | null>(null);
  const [savedWords, setSavedWords] = useState<SavedWord[]>([]);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [playingNodeId, setPlayingNodeId] = useState<string | null>(null);
  const [playingSentence, setPlayingSentence] = useState<string | null>(null);
  const [typingNodeId, setTypingNodeId] = useState<string | null>(null);
  const [revealedUnits, setRevealedUnits] = useState(0);
  const requestKey = useRef<string | null>(null);
  const previewedJob = useRef<string | null>(null);
  const knownNodeIds = useRef(new Set<string>());
  const animatedNodeIds = useRef(new Set<string>());
  const previousPlaying = useRef(false);
  const restartingPlayback = useRef(false);
  const { isPlaying, activeSegmentIndex, play, stop } = useAudioSync();

  const selections = useMemo(() => ({
    genre: OPTIONS.genre[selected.genre],
    identity: OPTIONS.identity[selected.identity],
    motive: OPTIONS.motive[selected.motive],
  }), [selected]);
  const savedSet = useMemo(() => new Set(savedWords.map((word) => word.word)), [savedWords]);

  const premise = customPrompt.trim() || `${selections.identity.name}在${selections.genre.name}的世界里，必须${selections.motive.name}。`;

  const refreshBalance = useCallback(async () => {
    const response = await fetch("/api/billing/status", { cache: "no-store" });
    if (!response.ok) return;
    const body = await response.json() as { credits?: { available?: number } };
    setCredits(body.credits?.available ?? 0);
  }, []);

  const loadStory = useCallback(async (storyId: string, options?: { animateLatest?: boolean }) => {
    const response = await fetch(`/api/generated-stories/${storyId}`, { cache: "no-store" });
    if (!response.ok) throw new Error("story_load_failed");
    const data = await response.json() as GeneratedStoryResponse;
    const newNodes = data.nodes.filter((node) => !knownNodeIds.current.has(node.id));
    knownNodeIds.current = new Set(data.nodes.map((node) => node.id));
    setStoryData(data);
    setTargetLanguage(data.story.target_language);
    setLearnerLevel(data.story.learner_level);
    setTtsMode(data.story.tts_mode);
    const latestNode = newNodes.at(-1);
    if (options?.animateLatest && latestNode && !animatedNodeIds.current.has(latestNode.id)) {
      stop();
      setPlayingNodeId(null);
      setPlayingSentence(null);
      animatedNodeIds.current.add(latestNode.id);
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setTypingNodeId(latestNode.id);
        setRevealedUnits(1);
      }
    }
    if (data.nodes.length > 0) setPhase("reader");
    return data;
  }, [stop]);

  useEffect(() => {
    queueMicrotask(() => { void refreshBalance(); });
  }, [refreshBalance]);

  useEffect(() => {
    queueMicrotask(() => setSavedWords(loadSavedWords()));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const loadVoices = () => setVoices(window.speechSynthesis.getVoices());
    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/generated-stories/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ttsMode, action: "opening" }),
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error("pricing_unavailable");
      setQuote(await response.json() as Quote);
    }).catch((reason) => {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setQuote(null);
      setPricingError(true);
    });
    return () => controller.abort();
  }, [ttsMode]);

  useEffect(() => {
    if (!initialStoryId) return;
    let cancelled = false;
    queueMicrotask(() => {
      loadStory(initialStoryId).then((data) => {
        if (cancelled || data.nodes.length > 0) return;
        const pending = data.jobs.find((job) => job.status === "queued" || job.status === "running");
        if (pending) setActiveJob({ jobId: pending.id, storyId: initialStoryId, branch: false });
      }).catch(() => {
        if (!cancelled) {
          setError(isZh ? "无法加载这个故事。" : "This story could not be loaded.");
          setPhase("intro");
        }
      });
    });
    return () => { cancelled = true; };
  }, [initialStoryId, isZh, loadStory]);

  useEffect(() => {
    if (!activeJob) return;
    let cancelled = false;
    const poll = async () => {
      while (!cancelled) {
        const response = await fetch(`/api/generated-stories/jobs/${activeJob.jobId}`, { cache: "no-store" });
        if (!response.ok) throw new Error("job_poll_failed");
        const body = await response.json() as { job: { status: string; stage: string; error_message_safe: string | null } };
        if (cancelled) return;
        setJobStage(body.job.stage);
        if (body.job.stage.includes("tts") && previewedJob.current !== activeJob.jobId) {
          await loadStory(activeJob.storyId, { animateLatest: true });
          previewedJob.current = activeJob.jobId;
        }
        if (body.job.status === "completed" || body.job.status === "partial_success") {
          await loadStory(activeJob.storyId, { animateLatest: true });
          await refreshBalance();
          if (body.job.status === "partial_success") {
            setError(body.job.error_message_safe ?? (isZh ? "正文已完成，语音生成失败；语音积分已自动退回。" : "The scene is ready, but narration failed. Its credits were returned."));
          }
          setActiveJob(null);
          requestKey.current = null;
          previewedJob.current = null;
          return;
        }
        if (body.job.status === "failed" || body.job.status === "canceled") {
          setError(body.job.error_message_safe ?? (isZh ? "生成失败，请重试。" : "Generation failed. Please try again."));
          setPhase((current) => current === "reader" ? "reader" : "intro");
          setActiveJob(null);
          requestKey.current = null;
          previewedJob.current = null;
          await refreshBalance();
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 1600));
      }
    };
    poll().catch(() => {
      if (!cancelled) setError(isZh ? "暂时无法获取生成进度，请稍后刷新。" : "Generation status is temporarily unavailable.");
    });
    return () => { cancelled = true; };
  }, [activeJob, isZh, loadStory, refreshBalance]);

  const chooseTarget = (target: TargetLanguage) => {
    setTargetLanguage(target);
    setLearnerLevel(target === "zh" ? "HSK 4" : "B1");
  };

  const chooseTtsMode = (mode: TtsMode) => {
    setQuote(null);
    setPricingError(false);
    setTtsMode(mode);
  };

  const randomizeGroup = (group: OptionGroup) => {
    setSelected((previous) => ({ ...previous, [group]: (previous[group] + 1 + Math.floor(Math.random() * 2)) % 3 }));
  };

  const randomizeAll = () => {
    setSelected({
      genre: Math.floor(Math.random() * 3),
      identity: Math.floor(Math.random() * 3),
      motive: Math.floor(Math.random() * 3),
    });
  };

  const startOpening = async () => {
    if (!quote) return;
    setError("");
    setPhase("generating");
    setJobStage("queued");
    requestKey.current ??= crypto.randomUUID();
    try {
      const response = await fetch("/api/generated-stories", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": requestKey.current },
        body: JSON.stringify({
          targetLanguage,
          learnerLevel,
          premise,
          ttsMode,
          setup: { genre: selections.genre.name, identity: selections.identity.name, motive: selections.motive.name, customPrompt: customPrompt.trim() || null },
        }),
      });
      const body = await response.json() as { error?: string; story_id?: string; job_id?: string };
      if (!response.ok || !body.story_id || !body.job_id) {
        setPhase("intro");
        if (body.error === "insufficient_credits") setError(isZh ? "积分不足，请先补充积分。" : "You need more credits to generate this story.");
        else setError(isZh ? "暂时无法开始生成，请稍后重试。" : "Generation could not start. Please try again.");
        return;
      }
      window.history.replaceState(null, "", `/generate?story=${body.story_id}`);
      setActiveJob({ jobId: body.job_id, storyId: body.story_id, branch: false });
    } catch {
      setPhase("intro");
      setError(isZh ? "网络连接中断，请重试。" : "The connection was interrupted. Please try again.");
    }
  };

  const chooseBranch = async (choiceId: string) => {
    if (!storyData || activeJob) return;
    stop();
    setPlayingNodeId(null);
    setPlayingSentence(null);
    setError("");
    const idempotencyKey = crypto.randomUUID();
    try {
      const response = await fetch(`/api/generated-stories/${storyData.story.id}/choices/${choiceId}`, {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
      });
      const body = await response.json() as { error?: string; story_id?: string; job_id?: string };
      if (!response.ok || !body.job_id) {
        if (body.error === "insufficient_credits") setError(isZh ? "积分不足，暂时无法继续这个分支。" : "You need more credits to continue this branch.");
        else setError(isZh ? "这个选择暂时无法生成，请刷新后重试。" : "This branch could not be generated. Please refresh and try again.");
        return;
      }
      setJobStage("queued");
      setActiveJob({ jobId: body.job_id, storyId: storyData.story.id, branch: true });
    } catch {
      setError(isZh ? "网络连接中断，请重试。" : "The connection was interrupted. Please try again.");
    }
  };

  const handleToggleSave = useCallback((segment: TextSegment, target: TargetLanguage) => {
    setSavedWords((current) => toggleSaved(current, fromSegment(segment, target)));
  }, []);

  const typingNode = storyData?.nodes.find((node) => node.id === typingNodeId) ?? null;
  const typingTotal = typingNode?.text_segments?.length
    ? typingNode.text_segments.length
    : Array.from(typingNode?.text ?? "").length;

  useEffect(() => {
    if (!typingNodeId || typingTotal <= 0) return;

    let visible = 1;
    const interval = window.setInterval(() => {
      visible += 1;
      setRevealedUnits(Math.min(visible, typingTotal));
      if (visible >= typingTotal) {
        window.clearInterval(interval);
        setTypingNodeId(null);
      }
    }, typingNode?.text_segments?.length ? 42 : 24);

    return () => window.clearInterval(interval);
  }, [typingNode?.text_segments?.length, typingNodeId, typingTotal]);

  useEffect(() => {
    if (isPlaying) {
      previousPlaying.current = true;
      return;
    }
    if (previousPlaying.current) {
      if (restartingPlayback.current) restartingPlayback.current = false;
      else {
        setPlayingNodeId(null);
        setPlayingSentence(null);
      }
    }
    previousPlaying.current = false;
  }, [isPlaying]);

  const toggleNodePlayback = (node: GeneratedNode) => {
    const active = playingNodeId === node.id && playingSentence === null;
    if (active) {
      stop();
      setPlayingNodeId(null);
      return;
    }

    const segments = node.text_segments ?? [];
    const audio = storyData?.audioAssets.find((asset) => asset.node_id === node.id && asset.audio_url);
    restartingPlayback.current = isPlaying;
    setPlayingNodeId(node.id);
    setPlayingSentence(null);
    play({
      audioUrl: audio?.audio_url,
      text: segments.length ? joinSegments(segments, storyData?.story.target_language ?? "zh") : node.text ?? "",
      timestamps: audio?.timestamps ?? [],
      voices,
      lang: storyData?.story.target_language ?? "zh",
    });
  };

  const toggleSentencePlayback = (node: GeneratedNode, sentence: SentenceGroup) => {
    if (!storyData) return;
    const key = `${node.id}:${sentence.start}-${sentence.end}`;
    if (playingSentence === key) {
      stop();
      setPlayingNodeId(null);
      setPlayingSentence(null);
      return;
    }

    const audio = storyData.audioAssets.find((asset) => asset.node_id === node.id && asset.audio_url);
    const timestamps = audio?.timestamps ?? [];
    restartingPlayback.current = isPlaying;
    setPlayingNodeId(node.id);
    setPlayingSentence(key);

    if (audio?.audio_url && timestamps[sentence.start] && timestamps[sentence.end]) {
      play({
        audioUrl: audio.audio_url,
        text: "",
        timestamps,
        voices,
        lang: storyData.story.target_language,
        startMs: timestamps[sentence.start].start,
        endMs: timestamps[sentence.end].end,
      });
      return;
    }

    const rangeStart = timestamps[sentence.start]?.start ?? 0;
    play({
      audioUrl: null,
      text: joinSegments(sentence.segments, storyData.story.target_language),
      timestamps: timestamps.slice(sentence.start, sentence.end + 1).map((timestamp) => ({
        start: timestamp.start - rangeStart,
        end: timestamp.end - rangeStart,
      })),
      voices,
      lang: storyData.story.target_language,
      segmentOffset: sentence.start,
    });
  };

  const currentNode = storyData?.nodes.find((node) => node.id === storyData.story.current_node_id) ?? storyData?.nodes.at(-1);
  const generatingLabel = jobStage === "queued"
    ? (isZh ? "正在等待编辑台空位" : "Waiting for the writing desk")
    : jobStage.includes("tts")
      ? (isZh ? "正在录制这一段旁白" : "Recording this scene's narration")
    : jobStage.includes("planning")
      ? (isZh ? "正在整理人物动机" : "Shaping character motives")
      : (isZh ? "正在写入新的故事段落" : "Writing the next scene");

  return (
    <>
      <Navbar />
      <main className="grid min-h-[calc(100vh-var(--nav-height))] min-w-0 bg-paper lg:grid-cols-[18.5rem_minmax(0,1fr)] xl:grid-cols-[18.5rem_minmax(0,1fr)_20rem]">
        <aside className="min-w-0 border-b-2 border-ink bg-paper-2 p-4 lg:border-r lg:border-b-0 lg:border-r-rule-2 lg:p-6">
          <div className="mb-7 flex items-center justify-between gap-4">
            <div><p className="hallmark-eyebrow text-muted">Quick start</p><h1 className="mt-1 text-lg font-bold">{isZh ? "快速开局" : "Quick opening"}</h1></div>
            <button type="button" onClick={randomizeAll} className="grid size-11 place-items-center rounded-full border-2 border-ink bg-paper shadow-[0_3px_0_var(--color-ink)] transition-transform hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none" aria-label={isZh ? "全部随机" : "Randomize all"}><RefreshCw className="size-4" /></button>
          </div>

          <div className="grid gap-7">
            <ControlLabel title={isZh ? "阅读语言" : "Reading language"} marker="01" />
            <div className="-mt-5 grid grid-cols-2 rounded-full border border-rule-2 bg-paper p-1">
              {(["zh", "en"] as TargetLanguage[]).map((target) => <SegmentButton key={target} active={targetLanguage === target} onClick={() => chooseTarget(target)}>{target === "zh" ? "中文" : "English"}</SegmentButton>)}
            </div>

            <ControlLabel title={isZh ? "语言等级" : "Learner level"} marker="02" />
            <select value={learnerLevel} onChange={(event) => setLearnerLevel(event.target.value)} className="-mt-5 min-h-11 rounded-input border border-rule-2 bg-paper px-3 outline-2 outline-transparent outline-offset-1 focus:outline-focus">
              {(targetLanguage === "zh" ? ["HSK 1", "HSK 2", "HSK 3", "HSK 4", "HSK 5", "HSK 6", "HSK 7", "HSK 8", "HSK 9"] : ["A1", "A2", "B1", "B2", "C1", "C2"]).map((level) => <option key={level}>{level}</option>)}
            </select>

            <div>
              <ControlLabel title={isZh ? "语音朗读" : "Narration"} marker="TTS" />
              <div className="mt-3 grid grid-cols-2 rounded-full border border-rule-2 bg-paper p-1">
                <SegmentButton active={ttsMode === "off"} onClick={() => chooseTtsMode("off")}>{isZh ? "暂不需要" : "Text only"}</SegmentButton>
                <SegmentButton active={ttsMode === "every_scene"} onClick={() => chooseTtsMode("every_scene")}>{isZh ? "每段生成" : "Every scene"}</SegmentButton>
              </div>
              <p className="mt-2 flex items-center justify-between gap-3 text-xs text-muted"><span>{isZh ? "音频与词级时间轴" : "Audio + word timing"}</span><strong className="text-accent-deep">{isZh ? "额外积分" : "Extra credits"}</strong></p>
            </div>

            {(["genre", "identity", "motive"] as OptionGroup[]).map((group, groupIndex) => (
              <section key={group}>
                <div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-sm font-bold">{isZh ? ["题材", "开局身份", "核心动机"][groupIndex] : ["Genre", "Identity", "Motive"][groupIndex]}</h2><button type="button" onClick={() => randomizeGroup(group)} className="min-h-8 font-outlier text-xs text-ink-2 hover:text-accent-deep">{isZh ? "换一个" : "Shuffle"}</button></div>
                <div className="grid grid-cols-3 gap-2">
                  {OPTIONS[group].map((option, index) => <button key={option.name} type="button" aria-pressed={selected[group] === index} onClick={() => setSelected((previous) => ({ ...previous, [group]: index }))} className="min-h-20 min-w-0 cursor-pointer rounded-input border border-rule-2 bg-paper p-2 text-left transition-colors hover:border-ink active:bg-paper-2 aria-pressed:border-ink aria-pressed:bg-accent-soft"><span className="block [overflow-wrap:anywhere] text-xs font-bold leading-tight">{option.name}</span><span className="mt-1 block text-[10px] leading-tight text-muted">{option.hint}</span></button>)}
                </div>
              </section>
            ))}

            <section>
              <button type="button" onClick={() => setCustomOpen((open) => !open)} aria-expanded={customOpen} className="flex min-h-12 w-full items-center justify-between border-y border-rule-2 text-left text-sm font-bold"><span>{isZh ? "写下你的想法" : "Add your own direction"}</span><span className="font-outlier">{customOpen ? "−" : "+"}</span></button>
              {customOpen && <div className="pt-4"><label className="sr-only" htmlFor="custom-story-prompt">{isZh ? "自定义故事想法" : "Custom story direction"}</label><textarea id="custom-story-prompt" value={customPrompt} onChange={(event) => setCustomPrompt(event.target.value)} maxLength={3000} placeholder={isZh ? "例如：故事发生在一座每天会遗忘一小时的城市。" : "For example: the city forgets one hour every day."} className="min-h-32 w-full resize-y rounded-input border border-ink bg-paper p-4 outline-2 outline-transparent outline-offset-1 placeholder:text-muted focus:outline-focus" /><p className="mt-2 text-xs text-muted">{isZh ? "可输入主题、大纲或提示；留空也能生成。" : "Theme, outline, or prompt. Leaving it blank also works."}</p></div>}
            </section>
          </div>
        </aside>

        <section className="min-w-0 bg-paper p-4 sm:p-8 lg:p-10">
          {phase === "intro" && <div className="mx-auto grid min-h-[68vh] w-full max-w-3xl content-center gap-10 py-8">
            <header className="grid gap-4"><p className="hallmark-eyebrow text-muted">A story in ten seconds</p><h2 className="hallmark-display max-w-[12ch] text-[clamp(2.7rem,7vw,5.5rem)]">{isZh ? "抽一张开局，走进你的故事。" : "Draw an opening. Step into your story."}</h2><p className="max-w-2xl text-lg leading-relaxed text-ink-2">{isZh ? "不必先写完整大纲。选三个关键设定，先交付可读的开场，再让故事跟着你的选择继续生长。" : "No complete outline required. Pick three anchors, read the opening, then let each choice grow the story."}</p></header>
            <article className="grid gap-6 rounded-card border-2 border-ink bg-paper-2 p-6 shadow-card sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:p-8"><div><p className="hallmark-eyebrow text-muted">{isZh ? "你的开场组合" : "Your opening mix"}</p><h3 className="mt-3 max-w-[22ch] text-3xl font-bold tracking-[-0.045em]">{premise}</h3><p className="mt-4 max-w-2xl text-ink-2">{isZh ? "三个选择会分别保留调查、冒险与人物关系的空间。" : "Three choices will preserve room for investigation, risk, and relationships."}</p></div><div className="grid size-24 place-items-center rounded-full border-2 border-ink bg-accent font-outlier text-xs font-semibold text-center -rotate-6">READY<br />TO OPEN</div></article>
            <div className="flex flex-wrap items-center gap-4"><button type="button" onClick={startOpening} disabled={!quote || Boolean(activeJob)} className="hallmark-btn"><Sparkles className="size-4" />{isZh ? "生成第一章" : "Generate chapter one"}</button><span className="font-outlier text-xs text-muted">{quote ? `${quote.total} ${isZh ? "积分" : "credits"}` : pricingError ? (isZh ? "价格尚未配置" : "Pricing is not configured") : (isZh ? "正在报价…" : "Getting quote…")}</span></div>
            {error && <ErrorNotice message={error} />}
          </div>}

          {phase === "generating" && <GeneratingPanel label={generatingLabel} tts={ttsMode === "every_scene"} isZh={isZh} />}

          {phase === "reader" && storyData && <div className="mx-auto w-full max-w-3xl pb-20">
            <header className="mb-8 flex flex-wrap items-end justify-between gap-4 md:mb-10">
              <div className="min-w-0">
                <h2 className="text-3xl font-bold tracking-[-0.045em] [overflow-wrap:anywhere]">{storyData.story.title ?? (isZh ? "未命名故事" : "Untitled story")}</h2>
                <p className="mt-1 text-xs text-muted">{storyData.story.target_language === "zh" ? "中文" : "English"} · {storyData.story.learner_level}{storyData.story.tts_mode === "every_scene" ? (isZh ? " · 含语音" : " · Narrated") : ""}</p>
              </div>
              <Link href="/generate" className="inline-flex min-h-11 items-center rounded-full border border-ink px-4 text-sm font-bold whitespace-nowrap transition-colors hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus active:translate-y-px">{isZh ? "再开一个故事" : "Start another"}</Link>
            </header>

            <article aria-busy={Boolean(typingNodeId)}>
              {storyData.nodes.map((node, index) => {
                const segments = node.text_segments ?? [];
                const isTyping = typingNodeId === node.id;
                const visibleSegments = isTyping ? segments.slice(0, revealedUnits) : segments;
                const visibleText = isTyping ? Array.from(node.text ?? "").slice(0, revealedUnits).join("") : node.text;
                const sentenceGroups = toSentenceGroups(visibleSegments, !isTyping);
                const wholeNodeActive = playingNodeId === node.id && playingSentence === null;
                const bodyClass = storyData.story.target_language === "en"
                  ? "font-body text-[20px] text-ink leading-[1.85] break-words md:text-[22px]"
                  : "font-reading text-[22px] text-ink break-words tracking-[0.045em] leading-[2] md:text-[26px]";
                const renderSegment = (segment: TextSegment, segmentIndex: number, isFirst: boolean) => (
                  <span key={`${node.id}-${segmentIndex}`}>
                    {shouldPrefixSpace(segment.word, storyData.story.target_language, isFirst) ? " " : ""}
                    <WordSegment
                      segment={segment}
                      index={segmentIndex}
                      isAudioActive={playingNodeId === node.id && activeSegmentIndex === segmentIndex}
                      lang={storyData.story.target_language}
                      isSaved={savedSet.has(segment.word)}
                      onToggleSave={(selectedSegment) => handleToggleSave(selectedSegment, storyData.story.target_language)}
                    />
                  </span>
                );

                return (
                  <section key={node.id} className={index ? "mt-12 pt-2 md:mt-16" : ""} aria-label={isZh ? `故事第 ${index + 1} 段` : `Story scene ${index + 1}`}>
                    <div className={bodyClass}>
                      {segments.length ? (
                        <>
                          <p className="hidden whitespace-pre-wrap md:block">
                            {visibleSegments.map((segment, segmentIndex) => renderSegment(segment, segmentIndex, segmentIndex === 0))}
                          </p>
                          <div className="flex flex-col gap-5 md:hidden">
                            {sentenceGroups.map((sentence) => {
                              const sentenceKey = `${node.id}:${sentence.start}-${sentence.end}`;
                              const sentenceActive = playingSentence === sentenceKey;
                              return (
                                <p key={sentenceKey} className="block">
                                  <span>{sentence.segments.map((segment, offset) => renderSegment(segment, sentence.start + offset, offset === 0))}</span>
                                  {sentence.complete && (
                                    <button
                                      type="button"
                                      onClick={() => toggleSentencePlayback(node, sentence)}
                                      aria-label={sentenceActive ? (isZh ? "停止播放当前句" : "Stop current sentence") : (isZh ? "播放当前句" : "Play current sentence")}
                                      className={`relative ml-2 inline-flex size-9 translate-y-1 cursor-pointer items-center justify-center rounded-full border border-ink transition-colors before:absolute before:-inset-1 before:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus active:translate-y-[5px] ${sentenceActive ? "bg-accent text-ink" : "bg-accent-soft text-ink hover:bg-accent"}`}
                                    >
                                      {sentenceActive ? <Square className="size-4 fill-current" /> : <Volume2 className="size-4" />}
                                    </button>
                                  )}
                                </p>
                              );
                            })}
                          </div>
                        </>
                      ) : <p className="whitespace-pre-wrap">{visibleText}</p>}
                    </div>

                    <div className="mt-7 flex justify-end">
                      <button
                        type="button"
                        onClick={() => toggleNodePlayback(node)}
                        disabled={isTyping}
                        className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-ink px-4 text-sm font-bold whitespace-nowrap transition-transform duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus active:translate-y-px disabled:cursor-wait disabled:opacity-50 ${wholeNodeActive ? "bg-ink text-paper" : "bg-paper hover:bg-accent-soft"}`}
                      >
                        {wholeNodeActive ? <Square className="size-4 fill-current" /> : <Volume2 className="size-4" />}
                        <span>{wholeNodeActive ? (isZh ? "停止播放" : "Stop") : (isZh ? "听这一段" : "Listen")}</span>
                      </button>
                    </div>
                  </section>
                );
              })}

              {activeJob && <div className="mt-10 flex items-center gap-3 text-sm text-ink-2" aria-live="polite"><span className="size-4 animate-spin rounded-full border-2 border-rule-2 border-r-accent-deep" />{generatingLabel}</div>}

              {currentNode && !typingNodeId && <section className="mt-10 pt-2">
                <h3 className="mb-2 text-sm font-bold text-ink-2">{isZh ? "接下来" : "Next"}</h3>
                <div className="flex w-full flex-col">
                  {currentNode.story_choices.map((choice, index) => (
                    <button
                      key={choice.id}
                      type="button"
                      disabled={Boolean(activeJob)}
                      onClick={() => chooseBranch(choice.id)}
                      className="group relative flex min-h-16 w-full cursor-pointer items-center border-b border-rule bg-paper px-1 py-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-wait disabled:opacity-50"
                    >
                      <span className="relative z-10 inline-grid grid-cols-[1.75rem_minmax(0,1fr)] items-center gap-3 font-body font-bold leading-snug">
                        <span className="inline-flex size-7 items-center justify-center rounded-full border border-ink bg-accent-soft font-outlier text-xs leading-none transition-[background-color,transform] duration-150 group-hover:bg-accent group-active:translate-y-px">{String.fromCharCode(65 + index)}</span>
                        <span className="min-w-0">
                          <span className="block">{choice.label}</span>
                          {choice.intent && <small className="mt-1 block font-normal text-muted">{choice.intent}</small>}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </section>}
            </article>
            {error && <div className="mt-5"><ErrorNotice message={error} /></div>}
          </div>}
        </section>

        <aside className="hidden min-w-0 border-l border-rule-2 bg-paper-3 p-6 xl:block"><div className="sticky top-[calc(var(--nav-height)+1.5rem)]"><span className="inline-flex min-h-8 items-center rounded-full border border-ink bg-accent-soft px-3 font-outlier text-[10px] font-semibold">DIRECTOR MODE · PRO</span><h2 className="mt-5 text-2xl font-bold tracking-[-0.04em]">{isZh ? "剧情操控室" : "Story control room"}</h2><p className="mt-3 text-sm leading-relaxed text-ink-2">{isZh ? "暂停一下，告诉故事接下来应当倾向哪里。高级功能上线后可编辑关系、世界规则与回溯分支。" : "Pause the story and steer what comes next. Edit relationships, world rules, and branches with the premium control room."}</p><div className="mt-6 grid gap-3">{[isZh ? "增加张力" : "Raise tension", isZh ? "改变关系" : "Shift a relationship", isZh ? "降低难度" : "Lower difficulty"].map((label) => <button key={label} type="button" disabled className="min-h-11 rounded-full border border-rule-2 bg-paper px-4 text-left text-sm font-semibold opacity-60">{label}</button>)}</div><div className="mt-8 rounded-card border border-rule-2 bg-paper p-5"><LockKeyhole className="size-5" /><p className="mt-4 text-sm font-bold">{isZh ? "付费功能，稍后开放" : "Premium controls coming later"}</p></div></div></aside>
      </main>
      <div className="fixed right-4 bottom-4 z-40 inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-accent-soft px-4 font-outlier text-xs shadow-[0_3px_0_var(--color-ink)]"><Coins className="size-4" /><span>{isZh ? "积分" : "Credits"}</span><strong>{credits ?? "—"}</strong></div>
    </>
  );
}

function shouldPrefixSpace(word: string, lang: TargetLanguage, isFirst: boolean) {
  return lang === "en" && !isFirst && !/^[.,!?:;)]/.test(word);
}

function joinSegments(segments: TextSegment[], lang: TargetLanguage) {
  return segments.reduce((text, segment, index) => {
    const space = shouldPrefixSpace(segment.word, lang, index === 0) ? " " : "";
    return `${text}${space}${segment.word}`;
  }, "");
}

function toSentenceGroups(segments: TextSegment[], finalizeLast: boolean) {
  const groups: SentenceGroup[] = [];
  let start = 0;

  segments.forEach((segment, index) => {
    if (/[.!?。！？…]$/.test(segment.word)) {
      groups.push({ start, end: index, segments: segments.slice(start, index + 1), complete: true });
      start = index + 1;
    }
  });

  if (start < segments.length) {
    groups.push({
      start,
      end: segments.length - 1,
      segments: segments.slice(start),
      complete: finalizeLast,
    });
  }

  return groups;
}

function ControlLabel({ title, marker }: { title: string; marker: string }) {
  return <div className="flex items-center justify-between gap-3"><h2 className="text-sm font-bold">{title}</h2><span className="hallmark-eyebrow text-muted">{marker}</span></div>;
}

function SegmentButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-pressed={active} onClick={onClick} className="min-h-9 cursor-pointer rounded-full px-2 text-sm font-bold whitespace-nowrap active:bg-paper-3 aria-pressed:bg-ink aria-pressed:text-paper">{children}</button>;
}

function GeneratingPanel({ label, tts, isZh }: { label: string; tts: boolean; isZh: boolean }) {
  return <div className="mx-auto grid min-h-[68vh] w-full max-w-2xl place-items-center"><div className="w-full"><div className="relative mb-8 size-20 rounded-full border-2 border-ink bg-accent-soft after:absolute after:inset-2 after:animate-spin after:rounded-full after:border-2 after:border-accent-deep after:border-r-transparent" /><p className="hallmark-eyebrow text-muted">Generating story</p><h2 className="mt-3 text-4xl font-bold tracking-[-0.045em]">{label}</h2><p className="mt-4 text-ink-2">{isZh ? "先完成可读正文，再独立处理语音；语音失败不会影响故事内容。" : "Text is committed first, then narration is processed independently without risking the scene."}</p><ol className="mt-8 grid gap-3 text-sm"><li className="font-bold text-ink">● {label}</li><li className="text-muted">○ {isZh ? "准备三个去向" : "Prepare three choices"}</li><li className="text-muted">○ {isZh ? "检查语言难度" : "Check learner level"}</li>{tts && <li className="flex items-center gap-2 text-muted"><Volume2 className="size-4" />{isZh ? "生成语音与词级时间轴" : "Generate narration and word timing"}</li>}</ol></div></div>;
}

function ErrorNotice({ message }: { message: string }) {
  return <p role="alert" className="rounded-input border border-error bg-error-soft px-4 py-3 text-sm text-error">{message}</p>;
}
