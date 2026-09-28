"use client";

/* Hallmark · Workbench · design-system: design.md · 青墨纸本
 * pre-emit critique: P5 H5 E4 S4 R5 V4 */

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { BookOpen, Bookmark, Flame, FolderOpen, Lock, Search, X } from "lucide-react";
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
  const [localCovers, setLocalCovers] = useState<Record<string, string>>({});
  const [failedCovers, setFailedCovers] = useState<Record<string, boolean>>({});
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
      <main className="hallmark-shell py-8 md:py-12">
        <section aria-labelledby="library-heading">
          <header className="mb-6 grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] sm:items-center">
            <h1 id="library-heading" className="hallmark-display text-4xl">{t("nav.stories")}</h1>
            <div className="min-w-0">
              <label className="relative block min-w-0">
                <span className="sr-only">{t("stories.search")}</span>
                <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" />
                <input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder={t("stories.search")} className="h-12 w-full rounded-input border border-rule bg-paper pl-12 pr-12 outline-none! placeholder:text-muted focus:border-accent-deep" />
                {searchQuery && <button type="button" onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 grid size-10 -translate-y-1/2 cursor-pointer place-items-center rounded-full" aria-label={isZh ? "清除搜索" : "Clear search"}><X className="size-4" /></button>}
              </label>
            </div>
          </header>

          <div className="mb-6 grid items-center gap-5 border-b border-rule pb-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
            <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
              <div role="group" aria-label={t("nav.learning")} className="flex flex-wrap items-center gap-2">
                <span className="mr-1 text-sm text-muted">{t("nav.learning")}</span>
                {(["zh", "en"] as TargetLang[]).map((value) => <button key={value} type="button" aria-pressed={target === value} onClick={() => setTarget(value)} className={`min-h-11 cursor-pointer rounded-full border px-4 text-sm font-bold whitespace-nowrap ${target === value ? "border-ink bg-accent" : "border-rule bg-paper hover:bg-paper-2"}`}>{value === "zh" ? t("lang.zh") : t("lang.en")}</button>)}
              </div>
              <div role="group" aria-label={t("stories.level")} className="flex flex-wrap items-center gap-2">
                <span className="mr-1 text-sm text-muted">{t("stories.level")}</span>
                {["All", ...LEVEL_FILTERS[target]].map((level) => {
                  const active = level === "All" ? !levelParam : levelParam === level;
                  return <button key={level} type="button" aria-pressed={active} onClick={() => setLevel(level)} className={`min-h-11 cursor-pointer rounded-full border px-3 text-sm font-bold whitespace-nowrap ${active ? "border-ink bg-ink text-paper" : "border-rule bg-paper hover:bg-paper-2"}`}>{level === "All" ? t("stories.all") : level}</button>;
                })}
              </div>
            </div>
            <div aria-label={isZh ? "学习记录" : "Learning activity"} className="grid w-full max-w-104 grid-cols-3 justify-self-center gap-3 text-center text-xs text-ink-2 sm:justify-self-end xl:max-w-none">
              <div className="min-w-0">
                <span className="flex items-center justify-center gap-2 text-base font-semibold tabular-nums text-ink"><BookOpen aria-hidden="true" className="size-4 text-accent-deep" />{exploredCount}</span>
                <span className="mt-1 block">{t("stories.explored")}</span>
              </div>
              <Link href="/saved-words" className="min-w-0 rounded-sm hover:text-accent-deep hover:underline focus-visible:outline-accent-deep!">
                <span className="flex items-center justify-center gap-2 text-base font-semibold tabular-nums text-ink"><Bookmark aria-hidden="true" className="size-4 text-accent-deep" />{savedWordsCount}</span>
                <span className="mt-1 block whitespace-nowrap">{t("savedWords.title")}</span>
              </Link>
              <div className="min-w-0">
                <span className="flex items-center justify-center gap-2 text-base font-semibold tabular-nums text-ink"><Flame aria-hidden="true" className="size-4 text-accent-deep" />{streakCount}</span>
                <span className="mt-1 block">{isZh ? "连续学习天数" : "Day streak"}</span>
              </div>
            </div>
          </div>

          {stories.length ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {stories.map((story) => {
                const progress = progressMap[story.id] ?? 0;
                const primary = story.target_lang === "zh" ? story.title_cn : story.title_en;
                const secondary = story.target_lang === "zh" ? story.title_en : story.title_cn;
                const card = <><div className="relative aspect-video w-full shrink-0 overflow-clip bg-paper-3">
                  {failedCovers[story.id] ? (
                    <div className="absolute inset-0 grid place-items-center bg-paper-3 p-6 text-center" role="img" aria-label={`${primary} cover unavailable`}>
                      <div>
                        <span className="hallmark-eyebrow">InkQuest · {story.genre}</span>
                        <span className="mx-auto mt-5 grid size-20 place-items-center rounded-full border-2 border-ink bg-accent-soft shadow-[0.3rem_0.3rem_0_var(--color-ink)]">
                          <BookOpen className="size-8" aria-hidden="true" />
                        </span>
                      </div>
                    </div>
                  ) : (
                    <Image src={localCovers[story.id] ?? story.image} alt={`${primary} cover`} fill style={{ objectPosition: story.imagePosition }} sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw" className={`object-cover ${story.locked ? "grayscale opacity-55" : ""}`} onError={() => {
                      // New covers may exist locally before the storage upload completes.
                      const localCover = story.image.match(/^https?:\/\/[^?#]+(\/covers\/[^?#]+)(?:[?#].*)?$/)?.[1];
                      if (localCover && !localCovers[story.id]) {
                        setLocalCovers((previous) => ({ ...previous, [story.id]: localCover }));
                      } else {
                        setFailedCovers((previous) => ({ ...previous, [story.id]: true }));
                      }
                    }} />
                  )}
                  {story.locked && <span className="absolute inset-0 grid place-items-center bg-ink/20"><span className="grid size-12 place-items-center rounded-full border-2 border-ink bg-paper"><Lock className="size-5" /></span></span>}
                </div>
                <div className="flex w-full min-w-0 flex-1 flex-col gap-3 bg-paper-2 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0 text-xs font-medium text-muted wrap-anywhere">{story.genre}</span>
                    <span className="shrink-0 rounded-full border border-rule px-3 py-1 text-xs whitespace-nowrap">{story.level}</span>
                  </div>
                  <div className="min-w-0">
                    <h2 className="font-display text-lg leading-snug font-semibold tracking-tight wrap-anywhere">{primary}</h2>
                    <p className="mt-2 text-sm leading-relaxed text-ink-2 wrap-anywhere">{secondary}</p>
                  </div>
                  <div className="mt-auto grid gap-2 pt-3">
                    <div className="flex justify-between gap-3 text-xs"><span>{story.locked ? t("stories.locked") : progress ? t("stories.progress") : t("stories.notStarted")}</span><span className="tabular-nums">{story.locked ? "" : `${progress}%`}</span></div>
                    <div className="h-1 overflow-clip rounded-full bg-rule"><div className="h-full bg-accent-deep" style={{ transform: `scaleX(${progress / 100})`, transformOrigin: "left" }} /></div>
                  </div>
                </div></>;
                const cardClassName = "flex h-full min-w-0 flex-col overflow-clip rounded-card border-2 border-ink bg-paper-2 text-left shadow-card transition-transform duration-200 ease-(--ease-out) hover:-translate-y-1 active:translate-y-0 motion-reduce:transform-none motion-reduce:transition-none";
                return story.locked ? <button key={story.id} type="button" onClick={() => setIsSubscribeOpen(true)} className={cardClassName}>{card}</button> : <Link key={story.id} href={`/stories/${story.id}`} className={cardClassName}>{card}</Link>;
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
