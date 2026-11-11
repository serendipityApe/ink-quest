"use client";

import StoryCover from "@/components/StoryCover";
import Link from "next/link";
import StoryPolicyNotice from "@/components/StoryPolicyNotice";
import FoundingReaderPrice from "@/components/FoundingReaderPrice";
import { useState } from "react";
import { ChevronRight, Volume2 } from "lucide-react";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import WordSegment from "@/components/WordSegment";
import { useAudioSync } from "@/hooks/useAudioSync";
import { useTranslations } from "@/i18n/I18nProvider";
import { DEFAULT_STORY_HREF, DEFAULT_STORY_ID } from "@/lib/stories/entry-points";
import type { TextSegment, Timestamp } from "@/types/story";

const COVER_BASE = process.env.NODE_ENV === "development"
  ? ""
  : (process.env.NEXT_PUBLIC_ASSET_BASE_URL ?? "").replace(/\/$/, "");

const featuredStories = [
  { id: DEFAULT_STORY_ID, genre: "Xianxia", level: "HSK 4", titleZh: "借来的山门 1：山下无水", titleEn: "The Borrowed Sect 1: The Dry Village", descriptionZh: "山上的水池满了，山下的村庄却无水可用。父亲留下的铜钥匙，藏着一份旧约的线索。", descriptionEn: "The mountain pools are full, but the village below is dry. Your father’s copper key points to an old agreement.", image: "/covers/the-borrowed-sect-1-inkwash.png" },
  { id: "receipt-from-tomorrow-zh", genre: "Urban Mystery", level: "HSK 5", titleZh: "来自明天的收据", titleEn: "The Receipt from Tomorrow", descriptionZh: "一张印着明天日期的收据，把普通的一天撕开一道缝。", descriptionEn: "A receipt dated tomorrow tears open an ordinary day.", image: "/covers/receipt-from-tomorrow-zh.svg" },
  { id: "the-seven-oclock-lost-and-found", genre: "Mystery", level: "HSK 4", titleZh: "七点前的失物", titleEn: "Lost and Found Before Seven", descriptionZh: "失物处七点就要搬空。你能替老人找回装着妻子声音的蓝布包吗？", descriptionEn: "The lost and found closes at seven. Can you recover a blue bag holding a recording of an old man’s wife?", image: "/covers/the-seven-oclock-lost-and-found-v2.png", imagePosition: "center 20%" },
];

const demoChoices = [
  { zh: "去找借山的旧账", en: "Look through the old accounts", result: "旧账写着：门派借山建院，村民和门派共用山泉。", resultEn: "The old accounts say the sect borrowed this land. The village and the sect share its spring." },
  { zh: "跟阿禾检查水轮", en: "Inspect the waterwheel with A He", result: "阿禾轻推轮边的小柄，空轮转了半圈。水轮没坏，堵住的只是水槽。", resultEn: "A He nudges the wheel and it turns. The wheel works; the channel is blocked." },
];

interface HomeProps {
  demoAudioUrl: string;
  demoSegments: TextSegment[];
  demoTimestamps: Timestamp[];
}

export default function Home({ demoAudioUrl, demoSegments, demoTimestamps }: HomeProps) {
  const [demoChoice, setDemoChoice] = useState<number | null>(null);

  const { play, stop, isPlaying, activeSegmentIndex } = useAudioSync();
  const { lang } = useTranslations();
  const isZh = lang === "zh";

  const demoEndMs = demoTimestamps[demoTimestamps.length - 1]?.end;

  const toggleDemoAudio = () => {
    if (isPlaying) { stop(); return; }
    play({
      audioUrl: demoAudioUrl,
      text: "",
      timestamps: demoTimestamps,
      voices: [],
      lang: "zh",
      endMs: demoEndMs,
    });
  };





  return (
    <>
      <Navbar />
      <main>
        <section className="hallmark-shell grid gap-12 py-12 md:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)] md:items-center md:gap-16 md:py-14 lg:py-16">
          <div className="min-w-0">
            <h1 className="hallmark-display max-w-[14ch] text-[32px] md:text-[52px]">{isZh ? <>由你抉择，在故事中读懂<span className="text-accent-deep">中英文</span>。</> : <>Learn <span className="text-accent-deep">Chinese & English</span> by living the story.</>}</h1>
            <p className="mt-7 max-w-[54ch] text-[19px] leading-relaxed text-ink-2">
              {isZh
                ? "专为语言学习者打造的分级互动小说。随时点词看注音、听地道发音，让剧情随着你的每一次决定向前推进。"
                : "Interactive web novels for language learners. Tap any word for instant definitions, listen with native audio, and shape the plot."}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link href={DEFAULT_STORY_HREF} className="hallmark-btn">
                {isZh ? "免费读 3 分钟" : "Read free for 3 minutes"}<span aria-hidden="true">→</span>
              </Link>
              <Link href="/stories" className="inline-flex min-h-11 items-center font-semibold whitespace-nowrap hover:text-primary">
                {isZh ? "浏览全部故事" : "Browse stories"}
              </Link>
            </div>
            <p className="mt-4 text-sm text-muted">{isZh ? "无需注册 · 免费章节 · 随时继续" : "No sign-up · Free chapters · Resume anytime"}</p>
          </div>

          <article className="min-w-0 rounded-card border-[1.5px] border-ink bg-surface-container-lowest p-5 shadow-[4px_4px_0_var(--color-ink)] sm:p-7 md:p-8" aria-label={isZh ? "可操作的互动阅读示例" : "Interactive reading demo"}>
            <header className="flex items-center justify-between gap-4 border-b border-rule pb-4">
              <div className="min-w-0">
                <strong className="block truncate font-display text-lg tracking-[-0.04em]">{isZh ? "借来的山门 1" : "The Borrowed Sect 1"}</strong>
                <span className="mt-1 block font-outlier text-[10px] text-muted">HSK 4 · XIANXIA</span>
              </div>
              <span className="rounded-full border border-ink bg-accent-soft px-3 py-1 text-xs font-semibold whitespace-nowrap">{isZh ? "可以点" : "Try it"}</span>
            </header>

            <div className="py-7">
              <p className="font-reading text-[clamp(1.35rem,3vw,1.9rem)] leading-[2] tracking-[0.05em]">{demoSegments.map((segment, index) => (
                segment.word === "发现" ? (
                  <WordSegment key={index} segment={{ ...segment, tier: "key", meaning: isZh ? "注意到；找到原来不知道的事" : "to notice; to discover" }} index={index} isAudioActive={activeSegmentIndex === index} lang="zh" isSaved={false} onToggleSave={() => undefined} />
                ) : (
                  <span key={index} className={activeSegmentIndex === index ? "word-audio-active" : undefined}>{segment.word}</span>
                )
              ))}</p>
              <button type="button" onClick={toggleDemoAudio} className="mt-5 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-ink bg-paper px-4 text-sm font-bold whitespace-nowrap hover:bg-accent-soft">
                <Volume2 className="size-4" aria-hidden="true" />
                {isPlaying ? (isZh ? "停止播放" : "Stop") : (isZh ? "听这一句" : "Listen to this line")}
              </button>
            </div>

            <div className="border-t border-rule pt-5">
              <p className="mb-2 text-sm font-bold text-ink-2">{isZh ? "你会怎么做？" : "What do you do?"}</p>
              <div className="grid gap-0">
                {demoChoices.map((choice, index) => (
                  <button key={choice.zh} type="button" aria-pressed={demoChoice === index} onClick={() => setDemoChoice(index)} className="group flex min-h-14 w-full cursor-pointer items-center gap-3 border-b border-rule py-3 text-left font-bold last:border-b-0 aria-pressed:text-accent-deep">
                    <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-ink bg-accent-soft font-outlier text-xs group-hover:bg-accent group-aria-pressed:bg-accent">{String.fromCharCode(65 + index)}</span>
                    <span className="min-w-0 flex-1">{isZh ? choice.zh : choice.en}</span>
                    <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden="true" />
                  </button>
                ))}
              </div>
            </div>

            {demoChoice !== null && (
              <div className="mt-5 border-l-4 border-accent-deep bg-accent-soft p-4" aria-live="polite">
                <p className="font-reading text-lg leading-relaxed">{demoChoices[demoChoice].result}</p>
                {!isZh && <p className="mt-2 text-sm text-ink-2">{demoChoices[demoChoice].resultEn}</p>}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <span className="text-sm font-semibold">{isZh ? "你的选择改变了剧情。" : "Your choice changed the story."}</span>
                  <Link href={DEFAULT_STORY_HREF} className="inline-flex min-h-11 items-center font-bold whitespace-nowrap hover:text-primary">
                    {isZh ? "继续完整故事" : "Continue the story"}<span aria-hidden="true">→</span>
                  </Link>
                </div>
              </div>
            )}
          </article>
        </section>

        <section className="border-y border-rule bg-ink py-14 text-paper md:py-20">
          <div className="hallmark-shell grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] md:items-end">
            <h2 className="hallmark-display max-w-[13ch] text-[26px] md:text-[36px]">{isZh ? "不用离开剧情，也能读懂中文。" : "Understand the Chinese without leaving the scene."}</h2>
            <div className="grid gap-5 text-paper-3 sm:grid-cols-3 md:grid-cols-1 lg:grid-cols-3">
              {(isZh ? [["点词", "拼音、释义和发音原地出现。"], ["听句", "自然语速与文字保持在一起。"], ["做选择", "词语在不同剧情结果里再次出现。"]] : [["Tap a word", "See pinyin, meaning, and pronunciation in place."], ["Hear the line", "Keep natural audio beside the text."], ["Make a choice", "Meet the same words inside new consequences."]]).map(([title, description]) => (
                <div key={title} className="border-t border-paper/30 pt-4">
                  <h3 className="font-display text-lg font-bold text-paper">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="hallmark-shell py-12 md:py-16" id="stories">
          <header className="mb-8 grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,.75fr)] md:items-end">
            <h2 className="hallmark-display max-w-[14ch] text-[26px] md:text-[36px]">{isZh ? "从一个免费章节开始。" : "Start with one free chapter."}</h2>
            <div><Link href="/stories" className="iq-quiet mb-2 px-0">{isZh ? "浏览全部故事" : "Browse all stories"} →</Link><p className="max-w-[58ch] text-ink-2 md:justify-self-end">{isZh ? "按题材和难度挑选，不需要先创建账户。读到第一个选择，就已经知道 InkQuest 是否适合你。" : "Choose by genre and level—no account required. By your first choice, you will know whether InkQuest is for you."}</p></div>
          </header>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {featuredStories.map((story) => (
              <Link key={story.id} href={`/stories/${story.id}`} className={`group flex min-w-0 flex-col overflow-clip rounded-card border-[1.5px] border-ink bg-surface-container-lowest shadow-card transition-[transform,box-shadow] duration-200 hover:-translate-y-1 hover:border-accent-deep `}>
                <div className={`iq-cover relative min-w-0 overflow-clip aspect-video`}>
                  <StoryCover src={`${COVER_BASE}${story.image}`} title={isZh ? story.titleZh : story.titleEn} position={story.imagePosition} sizes="(max-width: 768px) 100vw, 33vw" />
                </div>
                <div className={`bg-surface-container-lowest grid flex-1 gap-3 p-5 md:p-6`}>
                  <div className="flex items-center justify-between gap-3"><span className="font-outlier text-xs uppercase tracking-[0.08em]">{story.genre}</span><span className="rounded-full border border-ink px-3 py-1 text-xs whitespace-nowrap">{story.level}</span></div>
                  <h3 className="font-display text-2xl font-bold leading-tight tracking-tight">{isZh ? story.titleZh : story.titleEn}</h3>
                  <p className="m-0 text-sm text-ink-2">{isZh ? story.descriptionZh : story.descriptionEn}</p>
                  <span className="font-bold whitespace-nowrap">{isZh ? "免费试读" : "Read free"} <span aria-hidden="true">→</span></span>
                </div>
              </Link>
            ))}

          </div>
        </section>

        <section className="hallmark-shell py-16 md:py-20" aria-labelledby="founding-reader-heading">
          <div className="grid gap-6 rounded-card border-2 border-ink bg-paper-2 p-6 shadow-card md:grid-cols-[1fr_auto] md:items-center md:p-10">
            <div>
              <h2 id="founding-reader-heading" className="hallmark-display text-3xl">Founding Reader</h2>
              <p className="mt-4 text-4xl font-bold"><FoundingReaderPrice /></p>
              <p className="mt-4 max-w-[60ch] text-ink-2">{isZh ? "解锁会员阅读内容。按月自动续订，可随时取消；适用税费及最终金额在结账时显示。故事生成使用积分，提交前会显示所需积分。" : "Unlock premium reading content. Renews monthly; cancel anytime. Applicable taxes and the final total are shown at checkout. Story generation uses credits, quoted before submission."}</p>
            </div>
            <Link href="/subscribe" className="hallmark-btn w-fit">{isZh ? "查看订阅详情" : "View subscription details"}<span aria-hidden="true">→</span></Link>
          </div>
        </section>

        <section className="border-y-2 border-accent-deep bg-accent-soft py-16 md:py-20">
          <div className="hallmark-shell grid gap-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <div>
              <h2 className="hallmark-display max-w-[16ch] text-[26px] md:text-[36px]">{isZh ? "读过一次，再定制属于你的故事。" : "Read one first. Then make the next story yours."}</h2>
              <p className="mt-5 max-w-[58ch] text-ink-2">{isZh ? "选择题材、身份和目标，让 InkQuest 按你的中文水平生成可以继续选择的剧情。" : "Choose a genre, identity, and motive. InkQuest builds an interactive story around your language level."}</p>
            </div>
            <div><StoryPolicyNotice /><Link href="/generate" className="hallmark-btn mt-4 w-fit">{isZh ? "定制故事" : "Customize a story"}<span aria-hidden="true">→</span></Link></div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
