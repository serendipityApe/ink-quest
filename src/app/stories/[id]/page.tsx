import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  loadStory,
  toManifest,
  nodeResponse,
  premiumNodeIds,
  listCards,
} from "@/lib/stories/registry";
import { absoluteUrl, pageMetadata } from "@/lib/seo";
import JsonLd from "@/components/JsonLd";
import { isPremium } from "@/lib/dal";
import StructuredReader from "./StructuredReader";
import type { StoryNodeResponse } from "@/types/story";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const card = listCards().find((story) => story.id === id);
  if (!card) {
    const story = await loadStory(id);
    if (!story) notFound();
    // Withdrawn demos retain working reading URLs without competing in Search.
    return pageMetadata({
      title: `${story.title_en} — Archived Story`,
      description: "An archived InkQuest story. Browse the library for current reading material.",
      path: `/stories/${id}`,
      noindex: true,
    });
  }
  return pageMetadata({
    title: `${card.title_en} — ${card.level} ${card.target_lang === "zh" ? "Chinese" : "English"} Story`,
    description: card.description_en,
    path: `/stories/${id}`,
    image: card.image,
    noindex: card.locked,
  });
}

/**
 * 阅读页：Server Component。
 * 服务端直接从 registry 拿 manifest + start 节点，作为 props 喂给 Client 组件。
 * 首屏 HTML 自带正文 → loading 消失，三跳瀑布（HTML → /api/[id] → /api/[id]/nodes/start）砍成一跳。
 * 后续节点跳转仍走 /api/stories/[id]/nodes/[nodeId]（按需 + 鉴权 + 缓存）。
 */
export default async function StoryReaderPage({
  params,
}: Props) {
  const { id } = await params;
  const story = await loadStory(id);
  if (!story) notFound();
  const cards = listCards();
  const card = cards.find((entry) => entry.id === id) ?? null;

  const manifest = toManifest(story);
  const startId = manifest.start_node_id;

  // start 节点理论上不该是付费节点，但保险起见做一次鉴权 —— 若是付费且未订阅，
  // 不在 SSR 注水阶段把正文塞进 HTML（防泄漏），降级到客户端按需 fetch（会 403 弹订阅框）。
  const startIsPremium = premiumNodeIds(story).has(startId);
  let startNode: StoryNodeResponse | null = null;
  if (!startIsPremium || (await isPremium())) {
    startNode = nodeResponse(story, startId);
  }
  if (!startNode) {
    // 付费未订阅或数据缺失：交客户端 fetch 流程兜底
    startNode = {
      node_id: startId,
      bg_image: null,
      audio_url: null,
      text_segments: [],
      timestamps: [],
      choices: manifest.nodes[startId]?.choices ?? [],
    };
  }

  const url = absoluteUrl(`/stories/${id}`);
  const chineseStory = story.target_lang === "zh";
  const name = chineseStory ? story.title_cn : story.title_en;
  const structuredData = card ? {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CreativeWork",
        "@id": `${url}#story`,
        url,
        name,
        alternateName: chineseStory ? story.title_en : story.title_cn,
        description: card.description_en,
        image: absoluteUrl(card.image),
        inLanguage: chineseStory ? "zh-Hans" : "en",
        genre: card.genre,
        educationalLevel: card.level,
        learningResourceType: "Interactive story",
        isAccessibleForFree: !card.locked && premiumNodeIds(story).size === 0,
        ...(card.series ? {
          isPartOf: {
            "@type": "CreativeWorkSeries",
            name: card.series.title_en,
            alternateName: card.series.title_cn,
          },
        } : {}),
      },
    ],
  } : null;

  return <>
    {structuredData && <JsonLd data={structuredData} />}
    <StructuredReader storyId={id} manifest={manifest} startNode={startNode} />
  </>;
}
