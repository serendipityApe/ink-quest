"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronRight, Volume2 } from "lucide-react";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import WordSegment from "@/components/WordSegment";
import { useSpeak } from "@/hooks/useSpeak";
import { useTranslations } from "@/i18n/I18nProvider";
import type { TextSegment } from "@/types/story";

const featuredStories = [
  { id: "master-secret", genre: "Xianxia", level: "HSK 4", titleZh: "掌门的秘密", titleEn: "The Secret of the Master", descriptionZh: "你拜入山门的第一夜，师父留下了一封不该存在的信。", descriptionEn: "On your first night at the sect, your master leaves a letter that should not exist.", image: "https://lh3.googleusercontent.com/aida-public/AB6AXuByAGR3eAj-islCdaxw-6Hx-2vtqhn3nBZaza3MPUZbedeFnRCjiBZQwwW1Do80PwO5P_o9YyRRQZj6dCsJo6h-CsEcWBw9ZaNKjbEEpya6Aex_415Kqo5VEc60vfrnewFcp97JiesxmS_0a3ou8G3tky6bFtJTTLTv7N5R1lhm6FIpiyJG-rh-kxa7B4Dxv5Ws6OnwY2NyIvCljmxprVpclM6CJH2SW_AiEw2tzcx_pYB45qVstjmN_XtnKebSsTuVVtvY9DIhfZhu" },
  { id: "receipt-from-tomorrow", genre: "Sci-Fi", level: "HSK 3", titleZh: "来自明天的收据", titleEn: "Receipt from Tomorrow", descriptionZh: "一张印着明天日期的收据，把普通的一天撕开一道缝。", descriptionEn: "A receipt dated tomorrow tears open an ordinary day.", image: "https://lh3.googleusercontent.com/aida-public/AB6AXuAK9k_fl1ecLnHSrkzgIHZJRoM4FKQnbX7teZF1zGWruGOevP9yTZVowE1H03ohr9fARDSBqQAFCXBlK_pJlezQiDfwo18IgN8X5-oVd-_MkZFJLKhuCQ8XFbHC1Ag7fKmqqTHli8UGdOfXqQDiV-jxzX9hGVNUV2TH9iGR9WfwAzGCenZ2s-jNDm_Vb-ieCfjYqQE85z5xpfkzSM_IWG45K6bwsslWL41zX8FraJS5Ii4CeRJSCbO5uDzX8eUs33oXrCj-Wz3l5SOg" },
  { id: "last-train", genre: "Urban Horror", level: "HSK 5", titleZh: "末班车", titleEn: "The Last Train", descriptionZh: "末班地铁没有停在任何你认识的站。", descriptionEn: "The last train stops at none of the stations you know.", image: "https://lh3.googleusercontent.com/aida-public/AB6AXuDFUoNSnoejdFuBy8VNwharovOHGD6g44r4kKn7_HVILQUTKdbPU48FpekULUMbqrfICHZzk8drJXQlfE7Zmpo2MtjCbaX5wf0AQSDK-XnGV6cfYHSHhlC-3-tSFt-DIcN8vRiPW9SWieyCFiFbFGKKOQl7CjTuUyaYpyKtK0f4zj9gjjXmT6xaztpmGo4yS8sw3HgMexbrkiYBJ2MIVz2X4ykjjgZDEUQSaPMAS49Mble2l-P2mxVaDZr90UrV_jiSw7k_emBDjkZ6" },
];

const demoWord: TextSegment = {
  word: "来了",
  reading: "lái le",
  meaning: "came; arrived",
  level: "HSK 1",
  tier: "key",
};

const demoChoices = [
  { zh: "推开师尊的房门", en: "Enter the master’s room", result: "门后没有人，桌上的信却刚刚写完。", resultEn: "No one is there, but the letter on the desk has just been finished." },
  { zh: "躲到窗外继续观察", en: "Hide outside the window", result: "灯影里，多出了一道本不该存在的人影。", resultEn: "A second shadow appears in the lamplight—one that should not exist." },
];

export default function Home() {
  const [demoChoice, setDemoChoice] = useState<number | null>(null);
  const [languageIndex, setLanguageIndex] = useState(0);
  const { speak, speaking, supported } = useSpeak();
  const { lang } = useTranslations();
  const isZh = lang === "zh";
  const rotatingLanguages = isZh ? ["中文", "英文"] : ["Chinese", "English"];
  const localizedDemoWord = isZh ? { ...demoWord, meaning: "到了；出现了" } : demoWord;

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const interval = window.setInterval(() => {
      setLanguageIndex((current) => (current + 1) % rotatingLanguages.length);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [rotatingLanguages.length]);

  return (
    <>
      <Navbar />
      <main>
        <section className="hallmark-shell grid gap-12 py-12 md:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)] md:items-center md:gap-16 md:py-14 lg:py-16">
          <div className="min-w-0">
            <h1 className="hallmark-display max-w-[14ch] text-[clamp(2.75rem,5vw,4.75rem)] leading-[1.1]">
              {isZh ? <>由你抉择，在未知的情节里<span className="whitespace-nowrap">读懂<span className="sr-only">{rotatingLanguages[languageIndex]}</span><span aria-hidden="true" className="language-roller min-w-[2ch] text-accent-deep"><span className="language-roller__track" style={{ transform: `translateY(-${languageIndex * 1.18}em)` }}>{rotatingLanguages.map((language) => <span key={language} className="language-roller__word">{language}</span>)}</span></span>。</span></> : <><span className="whitespace-nowrap">Learn <span className="sr-only">{rotatingLanguages[languageIndex]}</span><span aria-hidden="true" className="language-roller min-w-[7ch] text-accent-deep"><span className="language-roller__track" style={{ transform: `translateY(-${languageIndex * 1.18}em)` }}>{rotatingLanguages.map((language) => <span key={language} className="language-roller__word">{language}</span>)}</span></span></span> by Living the Story.</>}
            </h1>
            <p className="mt-7 max-w-[54ch] text-lg leading-relaxed text-ink-2 md:text-xl">
              {isZh
                ? "专为语言学习者打造的分级互动小说。随时点词看注音、听地道发音，让剧情随着你的每一次决定向前推进。"
                : "Interactive web novels for language learners. Tap any word for instant definitions, listen with native audio, and shape the plot."}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link href="/stories/master-secret" className="hallmark-btn">
                {isZh ? "免费读 3 分钟" : "Read free for 3 minutes"}<span aria-hidden="true">→</span>
              </Link>
              <Link href="/stories" className="inline-flex min-h-11 items-center font-semibold whitespace-nowrap hover:text-primary">
                {isZh ? "浏览全部故事" : "Browse stories"}
              </Link>
            </div>
            <p className="mt-4 text-sm text-muted">{isZh ? "无需注册 · 免费章节 · 随时继续" : "No sign-up · Free chapters · Resume anytime"}</p>
          </div>

          <article className="min-w-0 rounded-card border-2 border-ink bg-paper p-5 shadow-[0.7rem_0.7rem_0_var(--color-ink)] sm:p-7 md:p-8" aria-label={isZh ? "可操作的互动阅读示例" : "Interactive reading demo"}>
            <header className="flex items-center justify-between gap-4 border-b border-rule pb-4">
              <div className="min-w-0">
                <strong className="block truncate font-display text-lg tracking-[-0.04em]">{isZh ? "掌门的秘密" : "The Secret of the Master"}</strong>
                <span className="mt-1 block font-outlier text-[10px] text-muted">HSK 4 · XIANXIA</span>
              </div>
              <span className="rounded-full border border-ink bg-accent-soft px-3 py-1 text-xs font-semibold whitespace-nowrap">{isZh ? "可以点" : "Try it"}</span>
            </header>

            <div className="py-7">
              <p className="font-reading text-[clamp(1.35rem,3vw,1.9rem)] leading-[2] tracking-[0.05em]">雨下得很大。你推开山门，看见师父站在灯下。他没有回头，只说：“你终于<WordSegment segment={localizedDemoWord} index={0} isAudioActive={speaking} lang="zh" isSaved={false} onToggleSave={() => undefined} />。”</p>
              <button type="button" disabled={!supported} onClick={() => speak("雨下得很大。你推开山门，看见师父站在灯下。他没有回头，只说：你终于来了。", "zh")} className="mt-5 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-ink bg-paper px-4 text-sm font-bold whitespace-nowrap hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-50">
                <Volume2 className="size-4" aria-hidden="true" />
                {speaking ? (isZh ? "正在播放" : "Playing") : (isZh ? "听这一句" : "Listen to this line")}
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
                  <Link href="/stories/master-secret" className="inline-flex min-h-11 items-center font-bold whitespace-nowrap hover:text-primary">
                    {isZh ? "继续完整故事" : "Continue the story"}<span aria-hidden="true">→</span>
                  </Link>
                </div>
              </div>
            )}
          </article>
        </section>

        <section className="border-y-2 border-ink bg-ink py-14 text-paper md:py-20">
          <div className="hallmark-shell grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] md:items-end">
            <h2 className="hallmark-display max-w-[13ch] text-[clamp(2.5rem,5vw,4.75rem)]">{isZh ? "不用离开剧情，也能读懂中文。" : "Understand the Chinese without leaving the scene."}</h2>
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

        <section className="hallmark-shell py-20 md:py-28" id="stories">
          <header className="mb-12 grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,.75fr)] md:items-end">
            <h2 className="hallmark-display max-w-[14ch] text-[clamp(2.5rem,5vw,4.5rem)]">{isZh ? "从一个免费章节开始。" : "Start with one free chapter."}</h2>
            <p className="max-w-[58ch] text-ink-2 md:justify-self-end">{isZh ? "按题材和难度挑选，不需要先创建账户。读到第一个选择，就已经知道 InkQuest 是否适合你。" : "Choose by genre and level—no account required. By your first choice, you will know whether InkQuest is for you."}</p>
          </header>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,.65fr)_minmax(0,.75fr)]">
            {featuredStories.map((story, index) => (
              <Link key={story.id} href={`/stories/${story.id}`} className={`group flex min-w-0 flex-col overflow-clip rounded-card border-2 border-ink bg-paper-2 shadow-card transition-[transform,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-[0.65rem_0.65rem_0_var(--color-ink)] ${index === 0 ? "md:row-span-2" : ""}`}>
                <div className={`relative min-w-0 overflow-clip ${index === 0 ? "aspect-[4/3] lg:min-h-[24rem]" : "aspect-video"}`}>
                  <Image src={story.image} alt={`${isZh ? story.titleZh : story.titleEn} cover`} fill sizes={index === 0 ? "(max-width: 768px) 100vw, 50vw" : "(max-width: 768px) 100vw, 30vw"} className="object-cover" />
                </div>
                <div className={`${index === 0 ? "bg-accent-soft" : "bg-paper-2"} grid flex-1 gap-3 p-5 md:p-6`}>
                  <div className="flex items-center justify-between gap-3"><span className="font-outlier text-xs uppercase tracking-[0.08em]">{story.genre}</span><span className="rounded-full border border-ink px-3 py-1 text-xs whitespace-nowrap">{story.level}</span></div>
                  <h3 className="hallmark-display text-2xl md:text-3xl">{isZh ? story.titleZh : story.titleEn}</h3>
                  <p className="m-0 text-sm text-ink-2">{isZh ? story.descriptionZh : story.descriptionEn}</p>
                  <span className="font-bold whitespace-nowrap">{isZh ? "免费试读" : "Read free"} <span aria-hidden="true">→</span></span>
                </div>
              </Link>
            ))}
            <Link href="/stories" className="grid min-h-48 content-between gap-6 rounded-card border-2 border-ink bg-paper-3 p-6 shadow-card md:col-span-2 lg:col-span-2">
              <div className="flex items-center justify-between gap-3"><span className="font-outlier text-xs uppercase tracking-[0.08em]">{isZh ? "更多世界" : "More worlds"}</span><span className="rounded-full border border-ink px-3 py-1 text-xs whitespace-nowrap">{isZh ? "持续更新" : "Ongoing"}</span></div>
              <h3 className="hallmark-display max-w-[18ch] text-3xl">{isZh ? "仙侠、科幻、悬疑，下一条支线正在等你。" : "Xianxia, science fiction, mystery—the next branch is waiting."}</h3>
              <span className="font-bold whitespace-nowrap">{isZh ? "浏览全部故事" : "Browse all stories"} <span aria-hidden="true">→</span></span>
            </Link>
          </div>
        </section>

        <section className="border-y-2 border-accent-deep bg-accent-soft py-16 md:py-20">
          <div className="hallmark-shell grid gap-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <div>
              <h2 className="hallmark-display max-w-[16ch] text-[clamp(2.5rem,5vw,4.5rem)]">{isZh ? "读过一次，再定制属于你的故事。" : "Read one first. Then make the next story yours."}</h2>
              <p className="mt-5 max-w-[58ch] text-ink-2">{isZh ? "选择题材、身份和目标，让 InkQuest 按你的中文水平生成可以继续选择的剧情。" : "Choose a genre, identity, and motive. InkQuest builds an interactive story around your language level."}</p>
            </div>
            <Link href="/generate" className="hallmark-btn w-fit">{isZh ? "定制故事" : "Customize a story"}<span aria-hidden="true">→</span></Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
