import { getUser } from "@/lib/dal";
import { quoteOpening, quoteScene, type TtsMode } from "@/lib/generation/pricing";

export async function POST(request: Request) {
  if (!await getUser()) return Response.json({ error: "unauthorized" }, { status: 401 });

  let ttsMode: TtsMode;
  try {
    const body = await request.json() as { ttsMode?: unknown; action?: unknown };
    if (body.ttsMode !== "off" && body.ttsMode !== "every_scene") {
      return Response.json({ error: "invalid_tts_mode" }, { status: 400 });
    }
    ttsMode = body.ttsMode;
    const quote = body.action === "scene" ? quoteScene(ttsMode) : quoteOpening(ttsMode);
    if (!quote) return Response.json({ error: "pricing_unavailable" }, { status: 503 });
    return Response.json(quote);
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
}
