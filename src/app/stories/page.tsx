"use client";

import Link from "next/link";
import Image from "next/image";
import { useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect, Suspense } from "react";
import { Search, Lock, X, FolderOpen, Bookmark, Flame } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SubscribeModal from "@/components/SubscribeModal";

// Story list definition
const STORIES = [
  {
    id: "master-secret",
    titleCn: "师尊的秘密",
    titleEn: "The Secret of the Master",
    level: "HSK 4",
    progress: 65,
    locked: false,
    genre: "Xianxia",
    image: "https://lh3.googleusercontent.com/aida-public/AB6AXuCVCmwDjWWepAYvAZcCqk_xatLu8OYqNUqHUG0Q60x2PRJ2AoTDRrrJnBGq0XoYF8SNjbM2zp6ydg-smBdAjFAWSF9YJuXW1LerMIUdwxPB2__jDs8iIu70UCFjQW7IOptszOBppgCmPOt0k2a7a5iMM2c9GSv0xzuX9Z3sCqIHvH0Y04ZsN8_6MU6JX1MaiCG05aWxbEREymYHdiHd9GVCiIrft4V9ZDo2QE9m1l5oXJ9DzNSc5XyZMYMCHTu0mO52wvh86e_8cFem",
  },
  {
    id: "lost-letter",
    titleCn: "遗失的信",
    titleEn: "The Lost Letter",
    level: "HSK 3",
    progress: 100,
    locked: false,
    genre: "Literature",
    image: "https://lh3.googleusercontent.com/aida-public/AB6AXuAK9k_fl1ecLnHSrkzgIHZJRoM4FKQnbX7teZF1zGWruGOevP9yTZVowE1H03ohr9fARDSBqQAFCXBlK_pJlezQiDfwo18IgN8X5-oVd-_MkZFJLKhuCQ8XFbHC1Ag7fKmqqTHli8UGdOfXqQDiV-jxzX9hGVNUV2TH9iGR9WfwAzGCenZ2s-jNDm_Vb-ieCfjYqQE85z5xpfkzSM_IWG45K6bwsslWL41zX8FraJS5Ii4CeRJSCbO5uDzX8eUs33oXrCj-Wz3l5SOg",
  },
  {
    id: "shadow-wall",
    titleCn: "长城之影",
    titleEn: "Shadows of the Wall",
    level: "HSK 5",
    progress: 0,
    locked: true,
    genre: "History/Sci-Fi",
    image: "https://lh3.googleusercontent.com/aida-public/AB6AXuAY23k1btIgdPesyxntFo5G0KN7A7e0i_9IafFx_v-faXzCF0oZ6yJyVxFjZUEh_oRShEWZShJFNoMHdFjJMZlx6tzFr5e0PTd7vlOXLb_9j1FqiaMREgIR7s2R1U_JteAs2f3iY7Drcl7s9lI2pEfcVP0I1b9WDwBFSSWBl-5N3P-1Qi6RkHC9bnruOAtUf3UU-mKI4NqhK8jZq12O3Ju41iokvF9YY1VuOp3I5FMdOO85n6WCEor-x_Qxb_i9K65UiGtqdsw16yR8",
  },
];

function LibraryContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const levelParam = searchParams.get("level");
  const selectedLevel =
    levelParam === "HSK3" ? "HSK 3" :
      levelParam === "HSK4" ? "HSK 4" :
        levelParam === "HSK5" ? "HSK 5" : "All";

  const [searchQuery, setSearchQuery] = useState("");
  const [isSubscribeOpen, setIsSubscribeOpen] = useState(false);
  const [savedWordsCount, setSavedWordsCount] = useState(12);
  const [streakCount, setStreakCount] = useState(5);

  // Read stats from localStorage to synchronize across navigation
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedWords = localStorage.getItem("savedWordsCount");
      if (savedWords) {
        setTimeout(() => setSavedWordsCount(parseInt(savedWords)), 0);
      }

      const streak = localStorage.getItem("streakCount");
      if (streak) {
        setTimeout(() => setStreakCount(parseInt(streak)), 0);
      }
    }
  }, []);

  const handleLevelChange = (level: string) => {
    if (level === "All") {
      router.push("/stories");
    } else {
      router.push(`/stories?level=${level.replace(" ", "")}`);
    }
  };

  // Filter logic
  const filteredStories = STORIES.filter((story) => {
    const matchesLevel = selectedLevel === "All" || story.level === selectedLevel;
    const matchesSearch =
      story.titleCn.toLowerCase().includes(searchQuery.toLowerCase()) ||
      story.titleEn.toLowerCase().includes(searchQuery.toLowerCase()) ||
      story.genre.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesLevel && matchesSearch;
  });

  return (
    <>
      <Navbar onSubscribeClick={() => setIsSubscribeOpen(true)} />

      <main className="flex-grow w-full max-w-container-max mx-auto px-reading-inset py-12 flex flex-col gap-10">

        {/* Page Header */}
        <header className="flex flex-col gap-2 border-b border-surface-container-high/30 pb-6">
          <h1 className="font-story-title-lg text-4xl md:text-[48px] leading-tight text-on-background">
            Welcome back, Learner.<br />Choose your next destiny.
          </h1>
          <p className="font-ui-body text-ui-body text-secondary mt-2 flex items-center gap-2 flex-wrap">
            <span>Current Level:</span>
            <span className="text-primary font-semibold">HSK 4</span>
            <span className="opacity-40">·</span>
            <span>3 Stories Explored</span>
          </p>
        </header>

        {/* Filter & Search Bar */}
        <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
          {/* Level Filter Tabs */}
          <div className="flex items-center gap-2 bg-surface-container-low p-1 rounded-lg">
            {["All", "HSK 3", "HSK 4", "HSK 5"].map((level) => (
              <button
                key={level}
                onClick={() => handleLevelChange(level)}
                className={`px-4 py-2 font-button-text text-xs uppercase tracking-wider rounded-md transition-all duration-300 cursor-pointer ${selectedLevel === level
                    ? "bg-primary text-white"
                    : "text-on-surface-variant hover:text-primary hover:bg-surface-container"
                  }`}
              >
                {level}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div className="relative max-w-xs w-full flex items-center">
            <Search className="absolute left-3 text-on-surface-variant/50 h-5 w-5 pointer-events-none" />
            <input
              type="text"
              placeholder="Search stories..."
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

        {/* Main Content Layout */}
        <div className="flex flex-col md:flex-row gap-12 items-start">
          {/* Left Column: Story Cards Grid */}
          <section className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-gutter w-full">
            {filteredStories.length > 0 ? (
              filteredStories.map((story) => (
                <article
                  key={story.id}
                  className="group flex flex-col gap-4 rounded-xl bg-surface-container-lowest p-2 border border-surface-container-high/10 transition-all duration-500 hover:bg-surface-container-low/50 hover:border-surface-container-high/30"
                >
                  {/* Card Cover Wrapper */}
                  <div className="aspect-[4/3] w-full overflow-hidden rounded-lg bg-surface-container relative">
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
                      alt={`${story.titleEn} Cover`}
                      className={`w-full h-full object-cover transition-all duration-700 ease-in-out mix-blend-multiply ${story.locked
                          ? "opacity-40 grayscale group-hover:opacity-60"
                          : "opacity-80 group-hover:opacity-100"
                        }`}
                      src={story.image}
                      fill
                      sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    />
                  </div>

                  {/* Card Info */}
                  <div className="px-2 pb-2 flex flex-col gap-3 flex-grow">
                    <div className="flex items-center justify-between">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full font-ui-pinyin-sm text-xs ${story.locked
                          ? "bg-surface-container text-secondary"
                          : "bg-primary-container/20 text-primary"
                        }`}>
                        {story.level}
                      </span>
                      <span className="font-ui-pinyin-sm text-[12px] text-on-surface-variant/60">
                        {story.genre}
                      </span>
                    </div>

                    <div className="flex-grow">
                      {story.locked ? (
                        <button
                          onClick={() => setIsSubscribeOpen(true)}
                          className="font-story-body-cn text-story-body-cn text-on-background leading-tight text-left block hover:text-primary transition-colors cursor-pointer"
                        >
                          {story.titleCn}
                        </button>
                      ) : (
                        <Link
                          href={`/stories/${story.id}`}
                          className="font-story-body-cn text-story-body-cn text-on-background leading-tight hover:text-primary transition-colors block"
                        >
                          {story.titleCn}
                        </Link>
                      )}
                      <p className="font-ui-body text-sm text-secondary mt-1">
                        {story.titleEn}
                      </p>
                    </div>

                    {/* Progress Bar */}
                    <div className="mt-2 flex flex-col gap-2">
                      <div className="flex justify-between font-ui-pinyin-sm text-[12px] text-secondary">
                        <span>{story.locked ? "Premium Locked" : "Progress"}</span>
                        <span>{story.locked ? "" : `${story.progress}%`}</span>
                      </div>
                      <div className="w-full h-[3px] bg-surface-container rounded-full overflow-hidden">
                        {!story.locked && (
                          <div
                            className={`h-full transition-all duration-1000 ease-out ${story.progress === 100 ? "bg-primary/40" : "bg-primary"
                              }`}
                            style={{ width: `${story.progress}%` }}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              ))
            ) : (
              /* 修复的关键：将原本裸露的 div 放在 : 后面，作为 filteredStories 为空时的 fallback */
              <div className="col-span-full py-16 text-center flex flex-col items-center justify-center gap-4 bg-surface-container-low/30 rounded-xl">
                <FolderOpen className="h-10 w-10 text-secondary/50" />
                <p className="font-ui-body text-secondary text-sm">No stories found matching your filter criteria.</p>
                <button
                  onClick={() => {
                    router.push("/stories");
                    setSearchQuery("");
                  }}
                  className="font-button-text text-xs uppercase tracking-widest text-primary hover:underline"
                >
                  Clear all filters
                </button>
              </div>
            )}
          </section>

          {/* Right Column: User Sidebar */}
          <aside className="w-full md:w-64 shrink-0 flex flex-col sm:flex-row md:flex-col gap-6 w-full">
            <div className="flex-1 flex flex-col gap-4 p-6 bg-surface-container-lowest rounded-xl border border-surface-container-high/15">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Bookmark className="h-5 w-5 text-primary" />
                  <span className="font-ui-body text-[14px] text-on-surface-variant">Saved Words</span>
                </div>
                <span className="font-story-title-lg text-primary text-2xl">
                  {savedWordsCount}
                </span>
              </div>
              <p className="text-[12px] text-secondary leading-normal mt-1 border-t border-surface-container/50 pt-3">
                Tap highlighted characters in the reader to save them.
              </p>
            </div>

            <div className="flex-1 flex flex-col gap-4 p-6 bg-surface-container-lowest rounded-xl border border-surface-container-high/15">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Flame className="h-5 w-5 text-rose-500 fill-rose-500" />
                  <span className="font-ui-body text-[14px] text-on-surface-variant">Day Streak</span>
                </div>
                <span className="font-story-title-lg text-primary text-2xl">
                  {streakCount}
                </span>
              </div>
              <p className="text-[12px] text-secondary leading-normal mt-1 border-t border-surface-container/50 pt-3">
                Read at least 15 characters daily to maintain your streak.
              </p>
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
