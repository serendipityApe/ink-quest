"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { BookOpen, Trash2, Volume2 } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SubscribeModal from "@/components/SubscribeModal";
import { useTranslations } from "@/i18n/I18nProvider";
import { loadSavedWords, removeWord, type SavedWord } from "@/lib/savedWords";
import { useSpeak } from "@/hooks/useSpeak";

export default function SavedWordsPage() {
  const { t } = useTranslations();
  const [words, setWords] = useState<SavedWord[]>([]);
  const [isSubscribeOpen, setIsSubscribeOpen] = useState(false);
  const { speak, supported: ttsSupported } = useSpeak();

  useEffect(() => {
    setWords(loadSavedWords());
  }, []);

  const handleRemove = (word: string) => {
    setWords((prev) => removeWord(prev, word));
  };

  // 倒序：最近收藏的在前；旧数据没有 savedAt（理论上已被过滤），保险起见用 ?? 0。
  const sorted = [...words].sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0));

  return (
    <>
      <Navbar onSubscribeClick={() => setIsSubscribeOpen(true)} />

      <main className="flex-grow w-full max-w-container-max mx-auto px-reading-inset py-12 flex flex-col gap-10">
        <header className="flex flex-col gap-2 border-b border-surface-container-high/30 pb-6">
          <h1 className="font-story-title-lg text-4xl md:text-[48px] leading-tight text-on-background">
            {t("savedWords.title")}
          </h1>
          <p className="font-ui-body text-ui-body text-secondary mt-2">
            {words.length}
          </p>
        </header>

        {words.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-6 py-24 text-center">
            <BookOpen className="h-12 w-12 text-secondary/40" />
            <p className="font-ui-body text-on-surface-variant">{t("savedWords.empty")}</p>
            <Link
              href="/stories"
              className="font-button-text text-xs uppercase tracking-widest text-primary border border-primary/30 px-6 py-2.5 rounded-full hover:bg-primary/5 transition-colors"
            >
              {t("savedWords.browse")}
            </Link>
          </div>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sorted.map((entry) => {
              const { word, reading, meaning, level, lang } = entry;
              return (
                <li
                  key={word}
                  className="flex flex-col gap-2 p-5 bg-surface-container-lowest rounded-xl border border-surface-container-high/15 hover:border-surface-container-high/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={
                          lang === "en"
                            ? "font-ui-body text-2xl text-on-background leading-none break-words"
                            : "font-story-body-cn text-2xl text-on-background leading-none"
                        }
                      >
                        {word}
                      </span>
                      {ttsSupported && (
                        <button
                          onClick={() => speak(word, lang)}
                          aria-label={`Pronounce ${word}`}
                          className="text-primary/70 hover:text-primary transition-colors p-1 rounded-full hover:bg-primary/10 cursor-pointer shrink-0"
                        >
                          <Volume2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <button
                      onClick={() => handleRemove(word)}
                      aria-label={`Remove ${word}`}
                      className="text-secondary/40 hover:text-rose-500 transition-colors shrink-0 mt-1"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {reading && (
                    <span className="font-ui-pinyin-sm text-sm text-secondary">
                      {reading}
                    </span>
                  )}
                  {meaning && (
                    <span className="font-ui-body text-sm text-on-surface-variant break-words">
                      {meaning}
                    </span>
                  )}
                  {level && (
                    <span className="text-[10px] uppercase tracking-wider text-primary bg-primary-container/10 px-2 py-0.5 rounded-full self-start">
                      {level}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </main>

      <Footer />
      <SubscribeModal isOpen={isSubscribeOpen} onClose={() => setIsSubscribeOpen(false)} />
    </>
  );
}
