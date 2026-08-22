import { getUser } from "@/lib/dal";
import { enqueueGenerationJob } from "@/lib/generation/queue";
import { quoteScene, type TtsMode } from "@/lib/generation/pricing";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; choiceId: string }> },
) {
  const user = await getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 160) {
    return Response.json({ error: "invalid_idempotency_key" }, { status: 400 });
  }

  const { id, choiceId } = await context.params;
  const supabase = await createClient();
  const storyResult = await supabase.from("generated_stories")
    .select("tts_mode").eq("id", id).eq("owner_id", user.id).maybeSingle();
  if (storyResult.error) return Response.json({ error: "story_unavailable" }, { status: 503 });
  if (!storyResult.data) return Response.json({ error: "story_not_found" }, { status: 404 });

  const ttsMode = storyResult.data.tts_mode as TtsMode;
  const quote = quoteScene(ttsMode);
  if (!quote) return Response.json({ error: "pricing_unavailable" }, { status: 503 });

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("create_story_branch_job", {
    p_user_id: user.id,
    p_story_id: id,
    p_choice_id: choiceId,
    p_quoted_amount: quote.total,
    p_pricing_version: quote.pricingVersion,
    p_idempotency_key: idempotencyKey,
    p_items: quote.items,
    p_input: {},
  });
  if (error) {
    if (error.message.includes("insufficient_credits")) return Response.json({ error: "insufficient_credits" }, { status: 402 });
    if (error.message.includes("already_selected")) return Response.json({ error: "choice_already_selected" }, { status: 409 });
    if (error.message.includes("not_found") || error.message.includes("invalid_story_choice")) {
      return Response.json({ error: "choice_not_found" }, { status: 404 });
    }
    console.error("Branch job creation failed", error);
    return Response.json({ error: "branch_creation_failed" }, { status: 500 });
  }

  const result = Array.isArray(data) ? data[0] : data;
  const dispatchQueued = typeof result?.job_id === "string" ? await enqueueGenerationJob(result.job_id) : false;
  return Response.json({ ...result, quote, dispatchQueued }, { status: result?.reused ? 200 : 202 });
}
