"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { BookOpen, Trash2 } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SubscribeModal from "@/components/SubscribeModal";
import { useTranslations } from "@/i18n/I18nProvider";

interface SavedWordInfo {
  word: string;
}

export default function SavedWordsPage() {
  const { t } = useTranslations();
  const [words, setWords] = useState<SavedWordInfo[]>([]);
  const [isSubscribeOpen, setIsSubscribeOpen] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem("cm_saved_words");
    const saved: string[] = raw ? JSON.parse(raw) : [];
    setWords(saved.map((w) => ({ word: w })));
  }, []);

  const handleRemove = (word: string) => {
    const updated = words.filter((w) => w.word !== word);
    setWords(updated);
    const updatedKeys = updated.map((w) => w.word);
    localStorage.setItem("cm_saved_words", JSON.stringify(updatedKeys));
    localStorage.setItem("savedWordsCount", updatedKeys.length.toString());
  };

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
            {words.map(({ word }) => (
              <li
                key={word}
                className="flex items-start justify-between gap-2 p-5 bg-surface-container-lowest rounded-xl border border-surface-container-high/15 hover:border-surface-container-high/30 transition-colors"
              >
                <span className="font-story-body-cn text-2xl text-on-background leading-none">
                  {word}
                </span>
                <button
                  onClick={() => handleRemove(word)}
                  aria-label={`Remove ${word}`}
                  className="text-secondary/40 hover:text-rose-500 transition-colors shrink-0 mt-0.5"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>

      <Footer />
      <SubscribeModal isOpen={isSubscribeOpen} onClose={() => setIsSubscribeOpen(false)} />
    </>
  );
}
