"use client";

import Link from "next/link";
import Image from "next/image";
import { useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect, useMemo } from "react";
import { Search, Lock, X, FolderOpen, Bookmark, Flame } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SubscribeModal from "@/components/SubscribeModal";
import { getStoryProgress } from "@/lib/progress";
import { useTranslations } from "@/i18n/I18nProvider";
import type { StoryCard, TargetLang } from "@/types/story";

// 各目标语言的分级筛选项
const LEVEL_FILTERS: Record<TargetLang, string[]> = {
  zh: ["HSK 3", "HSK 4", "HSK 5"],
  en: ["A1", "A2", "B1", "B2"],
};

interface Props {
  /** SSR 时由 Server Component 直接从 registry 取来注水的卡片目录 */
  cards: StoryCard[];
  /** 当前学习目标语言（与 cards 已按此过滤） */
  target: TargetLang;
}

export default function LibraryClient({ cards, target }: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { t } = useTranslations();

  // 分级筛选：URL ?level= 原样匹配卡片 level（纯客户端过滤，无需再请求）
  const levelParam = searchParams.get("level");

  const [searchQuery, setSearchQuery] = useState("");
  const [isSubscribeOpen, setIsSubscribeOpen] = useState(false);
  const [savedWordsCount, setSavedWordsCount] = useState(0);
  const [streakCount, setStreakCount] = useState(0);
  const [progressMap, setProgressMap] = useState<Record<string, number>>({});

  // 进度依赖 localStorage，仅客户端能算；服务端先用空 map 渲染骨架。
  useEffect(() => {
    const map: Record<string, number> = {};
    for (const s of cards) {
      if (s.locked) continue;
      const p = getStoryProgress(s.id);
      if (p.started) map[s.id] = p.percent;
    }
    setProgressMap(map);
  }, [cards]);

  // 读取统计数据
  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedWords = localStorage.getItem("savedWordsCount");
    if (savedWords) setSavedWordsCount(parseInt(savedWords) || 0);
    const streak = localStorage.getItem("streakCount");
    if (streak) setStreakCount(parseInt(streak) || 0);
  }, []);

  const handleTargetChange = (next: TargetLang) => {
    router.push(next === "zh" ? "/stories" : `/stories?target=${next}`);
  };

  const handleLevelChange = (level: string) => {
    const base = target === "zh" ? "/stories" : `/stories?target=${target}`;
    if (level === "All") {
      router.push(base);
    } else {
      const sep = base.includes("?") ? "&" : "?";
      router.push(`${base}${sep}level=${encodeURIComponent(level)}`);
    }
  };

  // Filter logic
  const filteredStories = useMemo(() => cards.filter((story) => {
    const matchesLevel = !levelParam || story.level === levelParam;
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      story.title_cn.toLowerCase().includes(q) ||
      story.title_en.toLowerCase().includes(q) ||
      story.genre.toLowerCase().includes(q);
    return matchesLevel && matchesSearch;
  }), [cards, levelParam, searchQuery]);

  const exploredCount = Object.keys(progressMap).length;
  const levelFilters = LEVEL_FILTERS[target];

  return (
    <>
      <Navbar onSubscribeClick={() => setIsSubscribeOpen(true)} />

      <main className="flex-grow w-full max-w-container-max mx-auto px-5 md:px-reading-inset py-6 md:py-12 flex flex-col gap-0 md:gap-10">

        {/* Page Header */}
        <header className="flex flex-col gap-4 pb-6 md:border-b md:border-surface-container-high/30">
          <h1 className="font-story-title-lg text-2xl md:text-[48px] leading-tight text-on-background">
            {t("stories.welcome")}<br />{t("stories.title")}
          </h1>
          <span className="hidden md:inline font-ui-body text-sm text-secondary">
            {exploredCount} {t("stories.explored")}
          </span>
        </header>

        {/* Body: mobile -> sidebar, filter card, recent title, list (stacked, via order);
            desktop -> full-width filter card on top, then [main column | sidebar] two columns */}
        <div className="flex flex-col md:flex-row md:flex-wrap gap-6 md:gap-x-12 md:gap-y-8 items-start">

          {/* Filter & Search — full-width card spanning both columns on desktop */}
          <div className="order-2 md:order-1 w-full bg-surface-container-lowest rounded-xl border border-surface-container-high/15 p-3 sm:p-4 flex flex-col gap-3 md:flex-row-reverse md:items-center md:justify-between">
              {/* Search Input */}
              <div className="relative w-full md:max-w-xs flex items-center">
                <Search className="absolute left-3 text-on-surface-variant/50 h-5 w-5 pointer-events-none" />
                <input
                  type="text"
                  placeholder={t("stories.search")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-surface-container-low border border-surface-container-high/40 focus:border-primary focus:ring-0 focus:outline-none rounded-lg pl-10 pr-4 py-2.5 font-ui-body text-[14px] placeholder:text-on-surface-variant/40 transition-colors"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 text-on-surface-variant/60 hover:text-on-surface flex items-center"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Filter groups: Learning language + Level */}
              <div className="flex flex-col gap-3 min-w-0">
                {/* Learning language toggle */}
                <div className="flex items-center gap-3 min-w-0">
                  <span className="shrink-0 w-14 md:w-auto font-button-text text-xs uppercase tracking-wider text-secondary">
                    {t("nav.learning")}:
                  </span>
                  <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mr-3 pr-3 md:mr-0 md:pr-0">
                    {(["zh", "en"] as TargetLang[]).map((lng) => (
                      <button
                        key={lng}
                        onClick={() => handleTargetChange(lng)}
                        className={`shrink-0 px-4 py-1.5 font-button-text text-xs uppercase tracking-wider rounded-full transition-all duration-300 cursor-pointer ${target === lng
                            ? "bg-primary text-white"
                            : "bg-surface-container-low text-on-surface-variant hover:text-primary hover:bg-surface-container"
                          }`}
                      >
                        {lng === "zh" ? t("lang.zh") : t("lang.en")}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Level Filter Tabs */}
                <div className="flex items-center gap-3 min-w-0">
                  <span className="shrink-0 w-14 md:w-auto font-button-text text-xs uppercase tracking-wider text-secondary">
                    {t("stories.level")}:
                  </span>
                  <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mr-3 pr-3 md:mr-0 md:pr-0">
                    {["All", ...levelFilters].map((level) => {
                      const active = level === "All" ? !levelParam : levelParam === level;
                      return (
                        <button
                          key={level}
                          onClick={() => handleLevelChange(level)}
                          className={`shrink-0 px-4 py-1.5 font-button-text text-xs uppercase tracking-wider rounded-full transition-all duration-300 cursor-pointer ${active
                              ? "bg-primary text-white"
                              : "bg-surface-container-low text-on-surface-variant hover:text-primary hover:bg-surface-container"
                            }`}
                        >
                          {level === "All" ? t("stories.all") : level}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
          </div>

          {/* Main column: Recent title + story grid */}
          <div className="order-3 md:order-2 flex-1 w-full flex flex-col gap-6">
            {/* Recent Stories title */}
            <div className="flex items-end justify-between">
              <h2 className="font-story-title-lg text-2xl md:text-3xl text-on-background leading-tight">
                {t("stories.recent")}
              </h2>
            </div>

            {/* Story Cards Grid */}
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-gutter w-full">
            {filteredStories.length > 0 ? (
              filteredStories.map((story) => {
                const progress = progressMap[story.id] ?? 0;
                // 学中文展示中文标题在上，学英文展示英文标题在上
                const primaryTitle = story.target_lang === "zh" ? story.title_cn : story.title_en;
                const secondaryTitle = story.target_lang === "zh" ? story.title_en : story.title_cn;
                return (
                <article
                  key={story.id}
                  className="group flex flex-row sm:flex-col gap-0 sm:gap-4 rounded-xl overflow-hidden bg-surface-container-lowest p-0 sm:p-2 border border-surface-container-high/10 transition-all duration-500 hover:bg-surface-container-low/50 hover:border-surface-container-high/30"
                >
                  {/* Card Cover Wrapper — flush on mobile, fills card height */}
                  <div className="relative w-24 self-stretch shrink-0 overflow-hidden bg-surface-container sm:w-full sm:aspect-[4/3] sm:self-auto sm:rounded-lg">
                    {story.locked ? (
                      <div
                        onClick={() => setIsSubscribeOpen(true)}
                        className="absolute inset-0 bg-surface-container-high/40 z-10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 cursor-pointer"
                      >
                        <div className="w-12 h-12 rounded-full bg-white/80 backdrop-blur-md flex items-center justify-center text-primary shadow-sm">
                          <Lock className="h-5 w-5" />
                        </div>
                      </div>
                    ) : null}

                    <Image
                      alt={`${story.title_en} Cover`}
                      className={`w-full h-full object-cover transition-all duration-700 ease-in-out mix-blend-multiply ${story.locked
                          ? "opacity-40 grayscale group-hover:opacity-60"
                          : "opacity-80 group-hover:opacity-100"
                        }`}
                      src={story.image}
                      fill
                      sizes="(max-width: 640px) 96px, (max-width: 1024px) 50vw, 33vw"
                    />

                    {/* Level badge overlaid on cover top-left */}
                    <span className={`absolute top-2 left-2 z-20 inline-flex items-center px-2 py-0.5 rounded-full font-ui-pinyin-sm text-[11px] backdrop-blur-sm ${story.locked
                        ? "bg-background/70 text-secondary"
                        : "bg-background/80 text-primary"
                      }`}>
                      {story.level}
                    </span>
                  </div>

                  {/* Card Info */}
                  <div className="min-w-0 px-3 py-2.5 sm:px-2 sm:pb-2 flex flex-col gap-2 sm:gap-3 flex-grow">
                    <div className="flex-grow min-w-0">
                      {story.locked ? (
                        <button
                          onClick={() => setIsSubscribeOpen(true)}
                          className="font-story-body-cn text-[17px] sm:text-story-body-cn text-on-background leading-snug text-left block hover:text-primary transition-colors cursor-pointer line-clamp-2"
                        >
                          {primaryTitle}
                        </button>
                      ) : (
                        <Link
                          href={`/stories/${story.id}`}
                          className="font-story-body-cn text-[17px] sm:text-story-body-cn text-on-background leading-snug hover:text-primary transition-colors block line-clamp-2"
                        >
                          {primaryTitle}
                        </Link>
                      )}
                      <p className="font-ui-body text-[13px] sm:text-sm text-secondary mt-0.5 sm:mt-1 line-clamp-1">
                        {secondaryTitle}
                      </p>
                      <span className="font-ui-pinyin-sm text-[11px] text-on-surface-variant/50 line-clamp-1">
                        {story.genre}
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="mt-1 sm:mt-2 flex flex-col gap-1.5 sm:gap-2">
                      <div className="flex justify-between font-ui-pinyin-sm text-[12px] text-secondary">
                        <span>
                          {story.locked
                            ? t("stories.locked")
                            : progress === 0
                              ? t("stories.notStarted")
                              : progress >= 100
                                ? t("stories.explored")
                                : t("stories.progress")}
                        </span>
                        <span>{story.locked ? "" : `${progress}%`}</span>
                      </div>
                      <div className="w-full h-[3px] bg-surface-container rounded-full overflow-hidden">
                        {!story.locked && (
                          <div
                            className={`h-full transition-all duration-1000 ease-out ${progress >= 100 ? "bg-primary/40" : "bg-primary"
                              }`}
                            style={{ width: `${progress}%` }}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </article>
                );
              })
            ) : (
              <div className="col-span-full py-16 text-center flex flex-col items-center justify-center gap-4 bg-surface-container-low/30 rounded-xl">
                <FolderOpen className="h-10 w-10 text-secondary/50" />
                <p className="font-ui-body text-secondary text-sm">{t("stories.empty")}</p>
                <button
                  onClick={() => {
                    handleLevelChange("All");
                    setSearchQuery("");
                  }}
                  className="font-button-text text-xs uppercase tracking-widest text-primary hover:underline"
                >
                  {t("stories.clear")}
                </button>
              </div>
            )}
            </section>
          </div>

          {/* Sidebar — mobile: bento row pinned to the top; desktop: right column beside the grid */}
          <aside className="order-1 md:order-3 w-full md:w-64 shrink-0 flex flex-row md:flex-col gap-4 md:gap-6">
            <Link
              href="/saved-words"
              className="flex-1 flex flex-col gap-4 p-4 md:p-6 bg-surface-container-lowest rounded-xl border border-surface-container-high/15 hover:border-primary/30 hover:bg-surface-container-low/50 transition-colors"
            >
              <div className="flex w-full items-center justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <Bookmark className="h-5 w-5 shrink-0 text-primary" />
                  <span className="font-ui-body text-[14px] text-on-surface-variant truncate">{t("savedWords.title")}</span>
                </div>
                <span className="font-story-title-lg text-primary text-2xl shrink-0 -translate-y-[2px]">
                  {savedWordsCount}
                </span>
              </div>
            </Link>

            <div className="flex-1 flex flex-col gap-4 p-4 md:p-6 bg-surface-container-lowest rounded-xl border border-surface-container-high/15">
              <div className="flex w-full items-center justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <Flame className="h-5 w-5 shrink-0 text-rose-500 fill-rose-500" />
                  <span className="font-ui-body text-[14px] text-on-surface-variant truncate">Day Streak</span>
                </div>
                <span className="font-story-title-lg text-primary text-2xl shrink-0 -translate-y-[2px]">
                  {streakCount}
                </span>
              </div>
            </div>
          </aside>
        </div>
      </main>

      <Footer />
      <SubscribeModal isOpen={isSubscribeOpen} onClose={() => setIsSubscribeOpen(false)} />
    </>
  );
}
