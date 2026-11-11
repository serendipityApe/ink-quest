"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { useTranslations } from "@/i18n/I18nProvider";
import { storyStatus, type SavedStory } from "@/lib/generation/story-library";

export default function MyStoriesClient({ stories, page, hasMore, unavailable }: {
  stories: SavedStory[]; page: number; hasMore: boolean; unavailable: boolean;
}) {
  const { lang } = useTranslations();
  const zh = lang === "zh";
  const router = useRouter();
  return <><Navbar /><main className="hallmark-shell py-10 md:py-16">
    <header className="mb-8 flex flex-wrap items-start justify-between gap-5 border-b border-rule pb-8">
      <div><h1 className="font-display text-3xl font-bold md:text-5xl">{zh ? "我的故事" : "My stories"}</h1>
        <p className="mt-4 max-w-xl text-muted">{zh ? "故事和续写会自动保存在你的账号中。回来后可从这里继续，无需重新生成。" : "Your stories and continuations are saved automatically to your account. Return here to keep reading without generating them again."}</p></div>
      <Link href="/generate" className="hallmark-btn">{zh ? "创建新故事" : "Create a story"} <span aria-hidden="true">→</span></Link>
    </header>
    <div className="mb-6 flex items-center justify-between gap-4"><span className="text-sm text-muted">{zh ? `第 ${page} 页 · 最新创建在前` : `Page ${page} · Newest first`}</span>
      <button type="button" onClick={() => router.refresh()} className="min-h-11 rounded-full border border-rule px-5 font-semibold hover:bg-paper-2">{zh ? "刷新列表" : "Refresh list"}</button></div>
    {unavailable ? <section role="alert" className="rounded-2xl border border-rule bg-paper-2 p-8"><h2 className="text-xl font-bold">{zh ? "暂时无法读取故事列表" : "Stories are temporarily unavailable"}</h2><p className="mt-3">{zh ? "这不代表故事被删除。请刷新重试。" : "This does not mean your stories were deleted. Refresh to try again."}</p></section>
      : stories.length === 0 ? <section className="rounded-2xl border border-rule bg-paper-2 p-10 text-center"><h2 className="text-xl font-bold">{page > 1 ? (zh ? "这一页没有故事" : "No stories on this page") : (zh ? "还没有创建故事" : "No stories yet")}</h2><p className="mt-3 text-muted">{zh ? "创建后的故事会自动出现在这里。" : "Stories you create will appear here automatically."}</p>{page > 1 && <Link className="mt-5 inline-block underline" href="/my-stories">{zh ? "返回第一页" : "Back to first page"}</Link>}</section>
      : <ul className="grid gap-5 md:grid-cols-2">{stories.map((story) => <li key={story.id} className="flex min-w-0 flex-col rounded-2xl border border-rule bg-paper-2 p-6">
        <div className="mb-4 flex flex-wrap gap-2 text-xs font-semibold"><span className="rounded-full border border-rule px-3 py-1">{story.target_language === "zh" ? "中文" : "English"} · {story.learner_level}</span><span className="rounded-full bg-paper px-3 py-1">{storyStatus(story.status, zh)}</span></div>
        <h2 className="break-words font-display text-2xl font-bold">{story.title || (zh ? "未命名故事" : "Untitled story")}</h2>
        <p className="mt-3 text-sm text-muted">{zh ? "创建日期" : "Created"} <time dateTime={story.created_at}>{story.created_at.slice(0, 10)}</time></p>
        <Link href={`/generate?story=${story.id}`} prefetch={false} className="mt-6 inline-flex min-h-11 items-center self-start rounded-full border-2 border-ink px-5 font-semibold hover:bg-accent-soft">{story.current_node_id ? (zh ? "继续阅读" : "Continue reading") : (zh ? "查看生成状态" : "View generation status")} <span aria-hidden="true" className="ml-3">→</span></Link>
      </li>)}</ul>}
    {!unavailable && (page > 1 || hasMore) && <nav aria-label={zh ? "故事分页" : "Story pages"} className="mt-8 flex justify-between gap-4">
      {page > 1 ? <Link className="inline-flex min-h-11 items-center rounded-full border border-rule px-5" href={`/my-stories?page=${page - 1}`}>{zh ? "上一页" : "Previous"}</Link> : <span />}
      {hasMore && <Link className="inline-flex min-h-11 items-center rounded-full border border-rule px-5" href={`/my-stories?page=${page + 1}`}>{zh ? "下一页" : "Next"}</Link>}
    </nav>}
  </main></>;
}
