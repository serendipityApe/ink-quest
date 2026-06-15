import { NextRequest, NextResponse } from "next/server";
import { listCards } from "@/lib/stories/registry";
import type { TargetLang } from "@/types/story";

/**
 * GET /api/stories?target=zh|en
 * 返回卡片目录（列表页/首页用）。按学习目标语言过滤；省略 target 返回全部。
 * 公开内容，可缓存。
 */
export async function GET(req: NextRequest) {
  const t = req.nextUrl.searchParams.get("target");
  const target: TargetLang | null = t === "zh" || t === "en" ? t : null;

  return NextResponse.json(
    { stories: listCards(target) },
    {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
      },
    }
  );
}
