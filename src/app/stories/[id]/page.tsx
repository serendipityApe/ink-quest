import { notFound } from "next/navigation";
import {
  loadStory,
  toManifest,
  nodeResponse,
  premiumNodeIds,
} from "@/lib/stories/registry";
import { isPremium } from "@/lib/dal";
import StructuredReader from "./StructuredReader";
import type { StoryNodeResponse } from "@/types/story";

/**
 * 阅读页：Server Component。
 * 服务端直接从 registry 拿 manifest + start 节点，作为 props 喂给 Client 组件。
 * 首屏 HTML 自带正文 → loading 消失，三跳瀑布（HTML → /api/[id] → /api/[id]/nodes/start）砍成一跳。
 * 后续节点跳转仍走 /api/stories/[id]/nodes/[nodeId]（按需 + 鉴权 + 缓存）。
 */
export default async function StoryReaderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const story = await loadStory(id);
  if (!story) notFound();

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

  return <StructuredReader storyId={id} manifest={manifest} startNode={startNode} />;
}
