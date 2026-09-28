import { listCards } from "@/lib/stories/registry";
import type { TargetLang } from "@/types/story";
import LibraryClient from "./LibraryClient";
import { pageMetadata } from "@/lib/seo";

type Props = { searchParams: Promise<{ target?: string; level?: string }> };

export async function generateMetadata({ searchParams }: Props) {
  const { target, level } = await searchParams;
  const isEnglish = target === "en";
  return pageMetadata({
    title: isEnglish ? "English Stories for Reading Practice" : "Chinese Graded Readers — HSK 3–5 Stories",
    description: isEnglish
      ? "Practice English with interactive mysteries, science fiction and thrillers. Choose a story by CEFR level, look up words and follow different endings."
      : "Explore Chinese stories at HSK 3, 4 and 5: xianxia, mystery, science fiction, romance and comedy. Read with word definitions, audio and branching choices.",
    path: isEnglish ? "/stories?target=en" : "/stories",
    noindex: Boolean(level),
  });
}

/**
 * 列表页：Server Component。
 * 服务端直接从 registry 拿目录卡片，首屏 HTML 自带数据，砍掉前端 fetch 与 loading。
 * 学习目标语言（target）走 URL 参数；切换 target 触发再次 SSR。
 * 分级筛选（level）与搜索（search）属于纯交互，放在客户端处理。
 */
export default async function StoriesLibrary({
  searchParams,
}: Props) {
  const sp = await searchParams;
  const target: TargetLang = sp.target === "en" ? "en" : "zh";
  const cards = listCards(target);

  return <LibraryClient cards={cards} target={target} />;
}
