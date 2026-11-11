"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Trash2, Volume2 } from "lucide-react";
import { DEFAULT_STORY_HREF } from "@/lib/stories/entry-points";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SubscribeModal from "@/components/SubscribeModal";
import { useTranslations } from "@/i18n/I18nProvider";
import { loadSavedWords, removeWord, type SavedWord } from "@/lib/savedWords";
import { useSpeak } from "@/hooks/useSpeak";

export default function SavedWordsPage() {
  const { t, lang: interfaceLang } = useTranslations();
  const isZh = interfaceLang === "zh";
  const [words, setWords] = useState<SavedWord[]>([]);
  const [isSubscribeOpen, setIsSubscribeOpen] = useState(false);
  const { speak, supported: ttsSupported } = useSpeak();

  useEffect(() => {
    const frame = requestAnimationFrame(() => setWords(loadSavedWords()));
    return () => cancelAnimationFrame(frame);
  }, []);

  const handleRemove = (word: string) => {
    setWords((prev) => removeWord(prev, word));
  };

  // 倒序：最近收藏的在前；旧数据没有 savedAt（理论上已被过滤），保险起见用 ?? 0。
  const sorted = [...words].sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0));

  return (
    <>
      <Navbar onSubscribeClick={() => setIsSubscribeOpen(true)} />

      <main className="hallmark-shell flex-grow py-12">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-3"><h1 className="hallmark-display text-[32px] md:text-[40px]">{t("savedWords.title")}</h1><p className="text-sm text-muted" aria-live="polite">{isZh ? `${words.length} 个生词` : `${words.length} ${words.length === 1 ? "word" : "words"}`}</p></header>
        {words.length > 0 && <ul className="overflow-clip rounded-card border-[1.5px] border-ink bg-surface-container-lowest">
          {sorted.map(({ word, reading, meaning, level, lang }) => <li key={word} className="flex flex-wrap items-center justify-between gap-4 border-b border-rule p-5 last:border-0 sm:p-6">
            <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-3"><span lang={lang} className="break-words text-2xl font-bold">{word}</span>{level && <span className="iq-badge">{level}</span>}</div>{reading && <p className="mt-2 font-outlier text-sm text-muted">{reading}</p>}{meaning && <p className="mt-2 break-words text-ink-2">{meaning}</p>}</div>
            <div className="flex gap-2"><button type="button" onClick={() => speak(word, lang)} disabled={!ttsSupported} aria-label={`${isZh ? "播放" : "Play"} ${word}`} className="iq-secondary disabled:opacity-50"><Volume2 className="size-4" />{isZh ? "播放" : "Play"}</button><button type="button" onClick={() => handleRemove(word)} aria-label={`${isZh ? "移除" : "Remove"} ${word}`} className="iq-quiet text-muted"><Trash2 className="size-4" />{isZh ? "移除" : "Remove"}</button></div>
          </li>)}
        </ul>}
        <section className="mt-8 rounded-card border border-rule bg-paper-2 p-6 sm:p-8"><h2 className="text-xl font-bold">{isZh ? "边读边积累你的生词本" : "Build your list while you read"}</h2><p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">{isZh ? "点击故事中有下划线的词，再选择收藏。它的读音和释义就会保存在这里。" : "Tap any underlined word in a story, then choose Save. It appears here with its pronunciation and meaning."}</p><Link href={DEFAULT_STORY_HREF} className="iq-secondary mt-5">{isZh ? "继续阅读" : "Continue reading"}<span aria-hidden="true">→</span></Link></section>
      </main>

      <Footer />
      <SubscribeModal isOpen={isSubscribeOpen} onClose={() => setIsSubscribeOpen(false)} />
    </>
  );
}
