"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Bookmark, Flame, FolderOpen, Lock, Search, X } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SubscribeModal from "@/components/SubscribeModal";
import { getStoryProgress } from "@/lib/progress";
import { useTranslations } from "@/i18n/I18nProvider";
import type { StoryCard, TargetLang } from "@/types/story";

const LEVEL_FILTERS: Record<TargetLang, string[]> = { zh: ["HSK 3", "HSK 4", "HSK 5"], en: ["A1", "A2", "B1", "B2"] };

interface Props { cards: StoryCard[]; target: TargetLang }

export default function LibraryClient({ cards, target }: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { t, lang } = useTranslations();
  const [searchQuery, setSearchQuery] = useState("");
  const [isSubscribeOpen, setIsSubscribeOpen] = useState(false);
  const [savedWordsCount, setSavedWordsCount] = useState(0);
  const [streakCount, setStreakCount] = useState(0);
  const [progressMap, setProgressMap] = useState<Record<string, number>>({});
  const levelParam = searchParams.get("level");

  useEffect(() => {
    const map: Record<string, number> = {};
    cards.forEach((story) => {
      if (story.locked) return;
      const progress = getStoryProgress(story.id);
      if (progress.started) map[story.id] = progress.percent;
    });
    const frame = requestAnimationFrame(() => setProgressMap(map));
    return () => cancelAnimationFrame(frame);
  }, [cards]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setSavedWordsCount(Number.parseInt(localStorage.getItem("savedWordsCount") ?? "0", 10) || 0);
      setStreakCount(Number.parseInt(localStorage.getItem("streakCount") ?? "0", 10) || 0);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const setTarget = (next: TargetLang) => router.push(next === "zh" ? "/stories" : `/stories?target=${next}`);
  const setLevel = (level: string) => {
    const base = target === "zh" ? "/stories" : `/stories?target=${target}`;
    router.push(level === "All" ? base : `${base}${base.includes("?") ? "&" : "?"}level=${encodeURIComponent(level)}`);
  };

  const stories = useMemo(() => cards.filter((story) => {
    const query = searchQuery.toLowerCase();
    return (!levelParam || story.level === levelParam) && [story.title_cn, story.title_en, story.genre].some((value) => value.toLowerCase().includes(query));
  }), [cards, levelParam, searchQuery]);

  const isZh = lang === "zh";
  const exploredCount = Object.keys(progressMap).length;

  return (
    <>
      <Navbar onSubscribeClick={() => setIsSubscribeOpen(true)} />
      <main>
        <section className="hallmark-shell grid gap-8 py-16 md:grid-cols-[minmax(0,1fr)_auto] md:items-end md:py-24">
          <div><p className="hallmark-eyebrow mb-4">Story archive</p><h1 className="hallmark-display max-w-[14ch] text-[clamp(3rem,7vw,6.5rem)]">{isZh ? "下一段命运，从这里分岔。" : "Your next destiny branches here."}</h1></div>
          <div className="grid min-w-56 grid-cols-2 gap-3">
            <Link href="/saved-words" className="rounded-card border-2 border-ink bg-accent-soft p-4 shadow-[0.3rem_0.3rem_0_var(--color-ink)]"><Bookmark className="mb-4 size-5" /><span className="block text-3xl font-bold tabular-nums">{savedWordsCount}</span><span className="text-sm">{t("savedWords.title")}</span></Link>
            <div className="rounded-card border-2 border-ink bg-paper-3 p-4 shadow-[0.3rem_0.3rem_0_var(--color-ink)]"><Flame className="mb-4 size-5" /><span className="block text-3xl font-bold tabular-nums">{streakCount}</span><span className="text-sm">Day streak</span></div>
          </div>
        </section>

        <section className="border-y-[3px] border-ink bg-paper-2 py-6">
          <div className="hallmark-shell grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="flex flex-wrap gap-3">
              <div className="flex flex-wrap items-center gap-2"><span className="hallmark-eyebrow mr-2">{t("nav.learning")}</span>{(["zh", "en"] as TargetLang[]).map((value) => <button key={value} type="button" onClick={() => setTarget(value)} className={`min-h-11 rounded-full border-2 border-ink px-4 text-sm font-bold whitespace-nowrap ${target === value ? "bg-accent" : "bg-paper"}`}>{value === "zh" ? t("lang.zh") : t("lang.en")}</button>)}</div>
              <div className="flex flex-wrap items-center gap-2"><span className="hallmark-eyebrow mr-2">{t("stories.level")}</span>{["All", ...LEVEL_FILTERS[target]].map((level) => { const active = level === "All" ? !levelParam : levelParam === level; return <button key={level} type="button" onClick={() => setLevel(level)} className={`min-h-11 rounded-full border-2 border-ink px-4 text-sm font-bold whitespace-nowrap ${active ? "bg-ink text-paper" : "bg-paper"}`}>{level === "All" ? t("stories.all") : level}</button>; })}</div>
            </div>
            <label className="relative block min-w-0 lg:w-80"><span className="sr-only">{t("stories.search")}</span><Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" /><input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder={t("stories.search")} className="h-12 w-full rounded-input border-2 border-ink bg-paper pl-12 pr-12 outline-2 outline-transparent outline-offset-1 placeholder:text-muted focus:outline-focus" />{searchQuery && <button type="button" onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full" aria-label="Clear search"><X className="size-4" /></button>}</label>
          </div>
        </section>

        <section className="hallmark-shell py-16 md:py-24">
          <header className="mb-12 grid grid-cols-1 gap-4"><p className="hallmark-eyebrow">{exploredCount} {t("stories.explored")}</p><h2 className="hallmark-display text-[clamp(2.4rem,5vw,4.5rem)]">{t("stories.recent")}</h2></header>
          {stories.length ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {stories.map((story, index) => {
                const progress = progressMap[story.id] ?? 0;
                const primary = story.target_lang === "zh" ? story.title_cn : story.title_en;
                const secondary = story.target_lang === "zh" ? story.title_en : story.title_cn;
                const card = <><div className={`relative min-w-0 overflow-clip ${index % 5 === 0 ? "aspect-[4/3]" : "aspect-video"}`}><Image src={story.image} alt={`${primary} cover`} fill sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw" className={`object-cover ${story.locked ? "grayscale opacity-55" : ""}`} />{story.locked && <span className="absolute inset-0 grid place-items-center bg-ink/20"><span className="grid size-12 place-items-center rounded-full border-2 border-ink bg-paper"><Lock className="size-5" /></span></span>}</div><div className={`grid gap-3 p-5 ${index % 3 === 0 ? "bg-accent-soft" : index % 3 === 1 ? "bg-paper-2" : "bg-paper-3"}`}><div className="flex items-center justify-between gap-3"><span className="hallmark-eyebrow">{story.genre}</span><span className="rounded-full border border-ink px-3 py-1 text-xs whitespace-nowrap">{story.level}</span></div><h3 className="hallmark-display text-2xl">{primary}</h3><p className="m-0 text-sm text-ink-2">{secondary}</p><div className="mt-2 grid gap-2"><div className="flex justify-between text-xs"><span>{story.locked ? t("stories.locked") : progress ? t("stories.progress") : t("stories.notStarted")}</span><span className="tabular-nums">{story.locked ? "" : `${progress}%`}</span></div><div className="h-1 overflow-clip rounded-full bg-rule"><div className="h-full bg-accent-deep" style={{ transform: `scaleX(${progress / 100})`, transformOrigin: "left" }} /></div></div></div></>;
                return story.locked ? <button key={story.id} type="button" onClick={() => setIsSubscribeOpen(true)} className="min-w-0 overflow-clip rounded-card border-2 border-ink text-left shadow-card transition-[transform,box-shadow] duration-200 hover:-translate-y-1 disabled:opacity-50">{card}</button> : <Link key={story.id} href={`/stories/${story.id}`} className="min-w-0 overflow-clip rounded-card border-2 border-ink shadow-card transition-[transform,box-shadow] duration-200 hover:-translate-y-1">{card}</Link>;
              })}
            </div>
          ) : <div className="grid min-h-72 place-items-center rounded-card border-2 border-dashed border-ink bg-paper-2 p-8 text-center"><div><FolderOpen className="mx-auto mb-4 size-10" /><p>{t("stories.empty")}</p><button type="button" onClick={() => { setLevel("All"); setSearchQuery(""); }} className="hallmark-btn mt-5">{t("stories.clear")}</button></div></div>}
        </section>
      </main>
      <Footer />
      <SubscribeModal isOpen={isSubscribeOpen} onClose={() => setIsSubscribeOpen(false)} />
    </>
  );
}
