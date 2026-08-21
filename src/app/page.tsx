"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SubscribeModal from "@/components/SubscribeModal";
import { useTranslations } from "@/i18n/I18nProvider";
import { ChevronRight, Volume2 } from "lucide-react";

const featuredStories = [
  { id: "master-secret", genre: "Xianxia", level: "HSK 4", titleZh: "掌门的秘密", titleEn: "The Secret of the Master", descriptionZh: "你拜入山门的第一夜，师父留下了一封不该存在的信。", descriptionEn: "On your first night at the sect, your master leaves a letter that should not exist.", image: "https://lh3.googleusercontent.com/aida-public/AB6AXuByAGR3eAj-islCdaxw-6Hx-2vtqhn3nBZaza3MPUZbedeFnRCjiBZQwwW1Do80PwO5P_o9YyRRQZj6dCsJo6h-CsEcWBw9ZaNKjbEEpya6Aex_415Kqo5VEc60vfrnewFcp97JiesxmS_0a3ou8G3tky6bFtJTTLTv7N5R1lhm6FIpiyJG-rh-kxa7B4Dxv5Ws6OnwY2NyIvCljmxprVpclM6CJH2SW_AiEw2tzcx_pYB45qVstjmN_XtnKebSsTuVVtvY9DIhfZhu" },
  { id: "receipt-from-tomorrow", genre: "Sci-Fi", level: "HSK 3", titleZh: "来自明天的收据", titleEn: "Receipt from Tomorrow", descriptionZh: "一张印着明天日期的收据，把普通的一天撕开一道缝。", descriptionEn: "A receipt dated tomorrow tears open an ordinary day.", image: "https://lh3.googleusercontent.com/aida-public/AB6AXuAK9k_fl1ecLnHSrkzgIHZJRoM4FKQnbX7teZF1zGWruGOevP9yTZVowE1H03ohr9fARDSBqQAFCXBlK_pJlezQiDfwo18IgN8X5-oVd-_MkZFJLKhuCQ8XFbHC1Ag7fKmqqTHli8UGdOfXqQDiV-jxzX9hGVNUV2TH9iGR9WfwAzGCenZ2s-jNDm_Vb-ieCfjYqQE85z5xpfkzSM_IWG45K6bwsslWL41zX8FraJS5Ii4CeRJSCbO5uDzX8eUs33oXrCj-Wz3l5SOg" },
  { id: "last-train", genre: "Urban Horror", level: "HSK 5", titleZh: "末班车", titleEn: "The Last Train", descriptionZh: "末班地铁没有停在任何你认识的站。", descriptionEn: "The last train stops at none of the stations you know.", image: "https://lh3.googleusercontent.com/aida-public/AB6AXuDFUoNSnoejdFuBy8VNwharovOHGD6g44r4kKn7_HVILQUTKdbPU48FpekULUMbqrfICHZzk8drJXQlfE7Zmpo2MtjCbaX5wf0AQSDK-XnGV6cfYHSHhlC-3-tSFt-DIcN8vRiPW9SWieyCFiFbFGKKOQl7CjTuUyaYpyKtK0f4zj9gjjXmT6xaztpmGo4yS8sw3HgMexbrkiYBJ2MIVz2X4ykjjgZDEUQSaPMAS49Mble2l-P2mxVaDZr90UrV_jiSw7k_emBDjkZ6" },
];

export default function Home() {
  const [isSubscribeOpen, setIsSubscribeOpen] = useState(false);
  const { lang } = useTranslations();
  const isZh = lang === "zh";

  return (
    <>
      <Navbar onSubscribeClick={() => setIsSubscribeOpen(true)} />
      <main>
        <section className="hallmark-shell relative grid min-h-[calc(78svh-var(--nav-height))] content-start pt-36 pb-16 md:min-h-[calc(92svh-var(--nav-height))] md:content-end md:py-24">
          <div className="mb-10"><p className="hallmark-eyebrow">Interactive Mandarin fiction</p></div>
          <div className="absolute right-[var(--page-gutter)] bottom-16 top-auto grid size-20 rotate-[8deg] place-items-center rounded-[48%_52%_55%_45%] border-[3px] border-ink bg-accent-soft shadow-[0.5rem_0.5rem_0_var(--color-ink)] transition-transform duration-200 hover:rotate-[-4deg] hover:scale-105 md:bottom-auto md:top-20 md:size-28" role="img" aria-label="InkQuest story guide"><span className="flex gap-3" aria-hidden="true"><i className="size-2 rounded-full bg-ink" /><i className="size-2 rounded-full bg-ink" /></span></div>
          <h1 className="hallmark-display max-w-[11.5ch] text-[clamp(3.3rem,9.6vw,9rem)]">{isZh ? <>让中文，变成你<span className="bg-[linear-gradient(var(--color-accent)_0_0)] bg-[length:100%_.32em] bg-[position:0_88%] bg-no-repeat">必须读完</span>的故事。</> : <>Make Mandarin a story you <span className="bg-[linear-gradient(var(--color-accent)_0_0)] bg-[length:100%_.32em] bg-[position:0_88%] bg-no-repeat">have to finish.</span></>}</h1>
          <Link href="#stories" className="mt-10 inline-flex min-h-11 w-fit items-center gap-3 font-outlier text-xs uppercase tracking-[0.1em] whitespace-nowrap"><span className="grid size-8 place-items-center rounded-full border border-ink" aria-hidden="true">↓</span>{isZh ? "向下开始冒险" : "Choose a world"}</Link>
        </section>
        <section className="bg-ink py-20 text-paper md:py-28">
          <div className="hallmark-shell grid gap-10 md:grid-cols-[minmax(0,1.15fr)_minmax(0,.85fr)] md:items-end">
            <h2 className="hallmark-display max-w-[13ch] text-[clamp(2.75rem,6vw,5.25rem)]">{isZh ? "不是背课文。是进入另一个世界。" : "Not another lesson. Another world."}</h2>
            <div className="grid max-w-[58ch] gap-6"><p className="m-0 text-xl text-paper-3">{isZh ? "在仙侠、科幻和都市悬疑中做选择。每一次决定都会改变剧情，也让真实、地道的中文在情境里留下来。" : "Make choices inside xianxia, science fiction, and urban mysteries. Every decision changes the plot—and gives real Mandarin a reason to stay with you."}</p><p className="hallmark-eyebrow text-accent">No textbook voice · no broken reading flow</p><Link href="/stories" className="hallmark-btn w-fit">{isZh ? "挑一个故事" : "Choose a story"}<span aria-hidden="true">→</span></Link></div>
          </div>
        </section>
        <section className="hallmark-shell py-20 md:py-28" id="stories">
          <header className="mb-14 grid grid-cols-1 gap-5"><p className="hallmark-eyebrow">Your first worlds</p><h2 className="hallmark-display max-w-[16ch] text-[clamp(2.5rem,5vw,4.5rem)]">{isZh ? "从今晚最想进入的世界开始。" : "Start with the world you want tonight."}</h2><p className="max-w-[65ch] text-ink-2 md:ml-auto">{isZh ? "每本故事都有清晰的难度、题材和阅读节奏。先读免费章节，再决定要不要继续深入。" : "Every story has a clear level, genre, and reading rhythm. Try a free chapter, then decide how deep you want to go."}</p></header>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,.65fr)_minmax(0,.75fr)]">
            {featuredStories.map((story, index) => <Link key={story.id} href={`/stories/${story.id}`} className={`group min-w-0 overflow-clip rounded-card flex flex-col border-2 border-ink bg-paper-2 shadow-card transition-[transform,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-[0.65rem_0.65rem_0_var(--color-ink)] ${index === 0 ? "md:row-span-2" : ""}`}><div className={`relative min-w-0 overflow-clip ${index === 0 ? "aspect-[4/3] lg:min-h-[24rem]" : "aspect-video"}`}><Image src={story.image} alt={`${isZh ? story.titleZh : story.titleEn} cover`} fill sizes={index === 0 ? "(max-width: 768px) 100vw, 50vw" : "(max-width: 768px) 100vw, 30vw"} className="object-cover" /></div><div className={`${index === 0 ? "bg-accent-soft" : "bg-paper-2"} flex-1 grid gap-3 p-5 md:p-6`}><div className="flex items-center justify-between gap-3"><span className="hallmark-eyebrow">{story.genre}</span><span className="rounded-full border border-ink px-3 py-1 text-xs whitespace-nowrap">{story.level}</span></div><h3 className="hallmark-display text-2xl md:text-3xl">{isZh ? story.titleZh : story.titleEn}</h3>{index === 0 && <p className="m-0 text-sm text-ink-2">{isZh ? story.descriptionZh : story.descriptionEn}</p>}<span className="font-bold whitespace-nowrap">{isZh ? "免费试读" : "Read free"} <span aria-hidden="true">→</span></span></div></Link>)}
            <Link href="/stories" className="grid min-h-48 content-between gap-6 rounded-card border-2 border-ink bg-paper-3 p-6 shadow-card md:col-span-2 lg:col-span-2"><div className="flex items-center justify-between gap-3"><span className="hallmark-eyebrow">Story archive</span><span className="rounded-full border border-ink px-3 py-1 text-xs whitespace-nowrap">{isZh ? "持续更新" : "Ongoing"}</span></div><h3 className="hallmark-display max-w-[18ch] text-3xl">{isZh ? "读完一条支线，下一条正在等你。" : "Finish one branch. The next is waiting."}</h3><span className="font-bold whitespace-nowrap">{isZh ? "浏览全部故事" : "Browse all stories"} <span aria-hidden="true">→</span></span></Link>
          </div>
        </section>
        <section className="border-y-2 border-accent-deep bg-paper-2 py-20 md:py-28" id="reader">
          <div className="hallmark-shell grid gap-10 md:grid-cols-[minmax(0,.75fr)_minmax(0,1.25fr)] md:items-start md:gap-16">
            <div className="grid content-start gap-6 md:sticky md:top-[calc(var(--nav-height)+2rem)]">
              <p className="hallmark-eyebrow">Stay inside the scene</p>
              <h2 className="hallmark-display max-w-[13ch] text-[clamp(2.75rem,6vw,5.25rem)]">{isZh ? "遇到生词，也不用离开故事。" : "Stay with the story, even at the hard parts."}</h2>
              <p className="max-w-[58ch] text-ink-2">{isZh ? "点一下词语即可看到拼音和释义。音频与选择都留在同一页，让注意力继续跟着剧情走。" : "Tap a word for help. Audio and choices stay on the same page, so your attention can keep following the scene."}</p>
              <div className="grid gap-4">
                {(isZh ? [
                  ["01", "点词即译", "拼音和释义在原句上方出现。"],
                  ["02", "原生音频", "听自然语速，不只记课本发音。"],
                  ["03", "选择推动记忆", "同一个词会在不同后果里再次出现。"],
                ] : [
                  ["01", "Tap to translate", "Pinyin and meaning appear in context."],
                  ["02", "Natural audio", "Hear the scene at a real pace."],
                  ["03", "Choices make it stick", "Words return with different consequences."],
                ]).map(([number, title, description]) => (
                  <article key={number} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3">
                    <span className="font-outlier text-xs text-accent-deep">{number}</span>
                    <div><h3 className="font-display text-base font-bold">{title}</h3><p className="mt-1 text-sm text-muted">{description}</p></div>
                  </article>
                ))}
              </div>
            </div>
            <article className="min-w-0 rounded-card border-2 border-ink bg-paper p-5 shadow-[0.7rem_0.7rem_0_var(--color-ink)] sm:p-8 md:p-10" aria-label={isZh ? "互动阅读示例" : "Interactive reading example"}>
              <header className="mb-8 flex items-center justify-between gap-4 border-b border-rule pb-5">
                <strong className="font-display text-xl tracking-[-0.04em]">{isZh ? "掌门的秘密" : "The Secret of the Master"}</strong>
                <span className="font-outlier text-xs text-muted">CHAPTER 01</span>
              </header>
              <p className="m-0 font-reading text-[clamp(1.35rem,3vw,2rem)] leading-[2] tracking-[0.06em]">{isZh ? <>雨下得很大。你推开山门，看见师父站在灯下。他没有回头，只说：“你终于<span className="word-key rounded-[.2rem] px-0.5">来了</span>。”</> : <>The rain is heavy. You open the mountain gate and find your master under the lantern. Without turning, he says: “You finally <span className="word-key rounded-[.2rem] px-0.5">came</span>.”</>}</p>
              <div className="mt-8 flex items-center justify-between gap-4 border-t border-rule pt-5">
                <span className="inline-flex items-center gap-2 font-outlier text-xs text-muted"><Volume2 className="size-4" /> {isZh ? "可播放旁白" : "Narration ready"}</span>
                <span className="font-outlier text-xs text-muted">{isZh ? "接下来" : "NEXT"}</span>
              </div>
              <div className="mt-3 grid gap-0">
                {(isZh ? ["潜入师尊房间", "在丹房外等待", "离开此地"] : ["Enter the master’s room", "Wait outside the alchemy room", "Leave this place"]).map((choice, index) => (
                  <Link key={choice} href="/stories/master-secret" className="group flex min-h-12 cursor-pointer items-center gap-3 border-b border-rule py-3 font-body font-bold transition-colors duration-150 last:border-b-0 hover:text-accent-deep">
                    <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-ink bg-accent-soft font-outlier text-xs transition-[background-color,transform] duration-150 group-hover:bg-accent group-active:translate-y-px">{String.fromCharCode(65 + index)}</span>
                    <span className="min-w-0 flex-1">{choice}</span>
                    <ChevronRight className="size-5 shrink-0 -translate-x-1 text-muted opacity-0 transition-[opacity,transform] duration-150 group-hover:translate-x-0 group-hover:opacity-100" aria-hidden="true" />
                  </Link>
                ))}
              </div>
            </article>
          </div>
        </section>
      </main>
      <Footer />
      <SubscribeModal isOpen={isSubscribeOpen} onClose={() => setIsSubscribeOpen(false)} />
    </>
  );
}
