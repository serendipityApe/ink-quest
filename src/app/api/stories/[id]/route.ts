import { NextResponse } from "next/server";
import { loadStory, toManifest } from "@/lib/stories/registry";

/**
 * GET /api/stories/[id]
 * 返回故事的轻量清单（图结构，无正文/时间戳）。公开内容，可缓存。
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const story = await loadStory(id);
  if (!story) {
    return NextResponse.json({ error: "Story not found" }, { status: 404 });
  }

  return NextResponse.json(toManifest(story), {
    headers: {
      // 清单是公开静态内容，可被 CDN/浏览器缓存
      "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
