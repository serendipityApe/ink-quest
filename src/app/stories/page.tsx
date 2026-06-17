import { listCards } from "@/lib/stories/registry";
import type { TargetLang } from "@/types/story";
import LibraryClient from "./LibraryClient";

/**
 * 列表页：Server Component。
 * 服务端直接从 registry 拿目录卡片，首屏 HTML 自带数据，砍掉前端 fetch 与 loading。
 * 学习目标语言（target）走 URL 参数；切换 target 触发再次 SSR。
 * 分级筛选（level）与搜索（search）属于纯交互，放在客户端处理。
 */
export default async function StoriesLibrary({
  searchParams,
}: {
  searchParams: Promise<{ target?: string; level?: string }>;
}) {
  const sp = await searchParams;
  const target: TargetLang = sp.target === "en" ? "en" : "zh";
  const cards = listCards(target);

  return <LibraryClient cards={cards} target={target} />;
}
