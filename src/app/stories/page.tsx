"use client";

import Link from "next/link";
import Image from "next/image";
import { useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect, Suspense, useMemo } from "react";
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

function LibraryContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { t } = useTranslations();

  // 学习目标语言：URL ?target= 优先，否则默认 zh（学中文是主站初始定位）
  const targetParam = searchParams.get("target");
  const target: TargetLang = targetParam === "en" ? "en" : "zh";

  // 分级筛选：URL ?level= 原样匹配卡片 level
  const levelParam = searchParams.get("level");

  const [searchQuery, setSearchQuery] = useState("");
  const [isSubscribeOpen, setIsSubscribeOpen] = useState(false);
  const [savedWordsCount, setSavedWordsCount] = useState(0);
  const [streakCount, setStreakCount] = useState(0);
  const [cards, setCards] = useState<StoryCard[]>([]);
  const [progressMap, setProgressMap] = useState<Record<string, number>>({});

  // 拉取当前目标语言的故事卡片
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/stories?target=${target}`)
      .then((r) => r.json())
      .then((d: { stories: StoryCard[] }) => {
        if (cancelled) return;
        setCards(d.stories);
        // 卡片到手后再算真实进度
        const map: Record<string, number> = {};
        for (const s of d.stories) {
          if (s.locked) continue;
          const p = getStoryProgress(s.id);
          if (p.started) map[s.id] = p.percent;
        }
        setProgressMap(map);
      })
      .catch(() => { if (!cancelled) setCards([]); });
    return () => { cancelled = true; };
  }, [target]);

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

      <main className="flex-grow w-full max-w-container-max mx-auto px-reading-inset py-12 flex flex-col gap-10">

        {/* Page Header */}
        <header className="flex flex-col gap-4 border-b border-surface-container-high/30 pb-6">
          <h1 className="font-story-title-lg text-4xl md:text-[48px] leading-tight text-on-background">
            {t("stories.welcome")}<br />{t("stories.title")}
          </h1>

          {/* 学习目标语言切换 */}
          <div className="flex items-center gap-2">
            <span className="font-ui-body text-sm text-secondary">{t("nav.learning")}:</span>
            {(["zh", "en"] as TargetLang[]).map((lng) => (
              <button
                key={lng}
                onClick={() => handleTargetChange(lng)}
                className={`px-3 py-1 rounded-full font-ui-pinyin-sm text-xs transition-colors cursor-pointer ${
                  target === lng
                    ? "bg-primary text-white"
                    : "bg-surface-container-low text-on-surface-variant hover:text-primary"
                }`}
              >
                {lng === "zh" ? "中文 Chinese" : "English 英语"}
              </button>
            ))}
            <span className="opacity-40">·</span>
            <span className="font-ui-body text-sm text-secondary">
              {exploredCount} {t("stories.explored")}
            </span>
          </div>
        </header>

        {/* Filter & Search Bar — mobile: search on top, levels scroll horizontally */}
        <div className="flex flex-col-reverse md:flex-row gap-4 items-stretch md:items-center justify-between">
          {/* Level Filter Tabs */}
          <div className="flex items-center gap-2 bg-surface-container-low p-1 rounded-lg flex-nowrap md:flex-wrap overflow-x-auto no-scrollbar -mx-reading-inset px-reading-inset md:mx-0 md:px-1">
            {["All", ...levelFilters].map((level) => {
              const active = level === "All" ? !levelParam : levelParam === level;
              return (
                <button
                  key={level}
                  onClick={() => handleLevelChange(level)}
                  className={`shrink-0 px-4 py-2 font-button-text text-xs uppercase tracking-wider rounded-md transition-all duration-300 cursor-pointer ${active
                      ? "bg-primary text-white"
                      : "text-on-surface-variant hover:text-primary hover:bg-surface-container"
                    }`}
                >
                  {level === "All" ? t("stories.all") : level}
                </button>
              );
            })}
          </div>

          {/* Search Input */}
          <div className="relative w-full md:max-w-xs flex items-center">
            <Search className="absolute left-3 text-on-surface-variant/50 h-5 w-5 pointer-events-none" />
            <input
              type="text"
              placeholder={t("stories.search")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-surface-container-low border border-surface-container-high/40 focus:border-primary focus:ring-0 focus:outline-none rounded-lg pl-10 pr-4 py-2 font-ui-body text-[14px] placeholder:text-on-surface-variant/40 transition-colors"
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
        </div>

        {/* Main Content Layout: mobile -> sidebar on top, cards below; desktop -> cards left, sidebar right */}
        <div className="flex flex-col-reverse md:flex-row gap-8 md:gap-12 items-start">
          {/* Left Column: Story Cards Grid */}
          <section className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-gutter w-full">
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

          {/* Right Column: User Sidebar (mobile: side-by-side bento above the list) */}
          <aside className="w-full md:w-64 shrink-0 flex flex-row md:flex-col gap-4 md:gap-6">
            <Link
              href="/saved-words"
              className="flex-1 flex flex-col gap-4 p-4 md:p-6 bg-surface-container-lowest rounded-xl border border-surface-container-high/15 hover:border-primary/30 hover:bg-surface-container-low/50 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Bookmark className="h-5 w-5 text-primary" />
                  <span className="font-ui-body text-[14px] text-on-surface-variant">{t("savedWords.title")}</span>
                </div>
                <span className="font-story-title-lg text-primary text-2xl">
                  {savedWordsCount}
                </span>
              </div>
            </Link>

            <div className="flex-1 flex flex-col gap-4 p-4 md:p-6 bg-surface-container-lowest rounded-xl border border-surface-container-high/15">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Flame className="h-5 w-5 text-rose-500 fill-rose-500" />
                  <span className="font-ui-body text-[14px] text-on-surface-variant">Day Streak</span>
                </div>
                <span className="font-story-title-lg text-primary text-2xl">
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

export default function StoriesLibrary() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-background">
        <span className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    }>
      <LibraryContent />
    </Suspense>
  );
}
