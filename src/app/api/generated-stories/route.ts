import { getUser } from "@/lib/dal";
import { quoteOpening, type TtsMode } from "@/lib/generation/pricing";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueGenerationJob } from "@/lib/generation/queue";

interface CreateStoryBody {
  targetLanguage?: unknown;
  learnerLevel?: unknown;
  premise?: unknown;
  ttsMode?: unknown;
  setup?: unknown;
}

export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 160) {
    return Response.json({ error: "invalid_idempotency_key" }, { status: 400 });
  }

  let body: CreateStoryBody;
  try {
    body = await request.json() as CreateStoryBody;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const targetLanguage = body.targetLanguage;
  const learnerLevel = typeof body.learnerLevel === "string" ? body.learnerLevel.trim() : "";
  const premise = typeof body.premise === "string" ? body.premise.trim() : "";
  if (body.ttsMode !== "off" && body.ttsMode !== "every_scene") {
    return Response.json({ error: "invalid_tts_mode" }, { status: 400 });
  }
  const ttsMode: TtsMode = body.ttsMode;
  const validLevels = targetLanguage === "zh"
    ? ["HSK 1", "HSK 2", "HSK 3", "HSK 4", "HSK 5", "HSK 6", "HSK 7", "HSK 8", "HSK 9"]
    : ["A1", "A2", "B1", "B2", "C1", "C2"];
  const setupSize = JSON.stringify(body.setup ?? null).length;
  if ((targetLanguage !== "zh" && targetLanguage !== "en") || !validLevels.includes(learnerLevel) || !premise || premise.length > 4000 || setupSize > 20_000) {
    return Response.json({ error: "invalid_story_setup" }, { status: 400 });
  }

  const quote = quoteOpening(ttsMode);
  if (!quote) return Response.json({ error: "pricing_unavailable" }, { status: 503 });

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("create_generated_story_job", {
      p_user_id: user.id,
      p_target_language: targetLanguage as "zh" | "en",
      p_learner_level: learnerLevel,
      p_premise: premise,
      p_tts_mode: ttsMode,
      p_quoted_amount: quote.total,
      p_pricing_version: quote.pricingVersion,
      p_idempotency_key: idempotencyKey,
      p_items: quote.items,
      p_input: {
        setup: body.setup ?? null,
        premise,
        targetLanguage,
        learnerLevel,
        ttsMode,
      },
    });

    if (error) {
      if (error.message.includes("insufficient_credits")) {
        return Response.json({ error: "insufficient_credits" }, { status: 402 });
      }
      console.error("Story job creation failed", error);
      return Response.json({ error: "story_creation_failed" }, { status: 500 });
    }

    const result = Array.isArray(data) ? data[0] : data;
    const jobId = result?.job_id;
    const dispatchQueued = typeof jobId === "string" ? await enqueueGenerationJob(jobId) : false;
    return Response.json({ ...result, quote, dispatchQueued }, { status: result?.reused ? 200 : 202 });
  } catch (error) {
    console.error("Story job creation unavailable", error);
    return Response.json({ error: "story_creation_unavailable" }, { status: 503 });
  }
}
