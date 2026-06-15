import { NextResponse } from "next/server";
import {
  loadStory,
  nodeResponse,
  premiumNodeIds,
} from "@/lib/stories/registry";
import { isPremium } from "@/lib/dal";

/**
 * GET /api/stories/[id]/nodes/[nodeId]
 * 返回单个节点的完整可渲染内容（正文 + 时间戳 + 选项）。
 *
 * 鉴权：若该节点是付费内容（被某个 premium 选项指向），
 * 仅向已订阅用户下发；未订阅返回 403 —— 内容不出服务端，前端无法绕过。
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; nodeId: string }> }
) {
  const { id, nodeId } = await params;
  const story = await loadStory(id);
  if (!story) {
    return NextResponse.json({ error: "Story not found" }, { status: 404 });
  }

  // 先鉴权：付费节点（被 premium 选项指向）仅对已订阅用户开放。
  // 放在存在性检查之前 —— 付费节点是否存在本身也是付费信息，不该泄漏给未订阅用户，
  // 同时让指向「付费占位节点」的选项也能稳定触发 403 → 前端弹订阅框。
  if (premiumNodeIds(story).has(nodeId)) {
    const allowed = await isPremium();
    if (!allowed) {
      return NextResponse.json(
        { error: "Premium content", premium: true },
        { status: 403 }
      );
    }
  }

  const node = nodeResponse(story, nodeId);
  if (!node) {
    return NextResponse.json({ error: "Node not found" }, { status: 404 });
  }

  return NextResponse.json(node, {
    headers: {
      // 因含鉴权分支，按用户私有缓存，避免 CDN 缓存到付费内容
      "Cache-Control": "private, max-age=60",
    },
  });
}
