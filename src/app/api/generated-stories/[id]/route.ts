import { getUser } from "@/lib/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const supabase = await createClient();

  const storyResult = await supabase.from("generated_stories")
    .select("id,title,premise,target_language,learner_level,status,current_node_id,tts_mode,story_version,created_at,updated_at")
    .eq("id", id).eq("owner_id", user.id).maybeSingle();

  if (storyResult.error) return Response.json({ error: "story_unavailable" }, { status: 503 });
  if (!storyResult.data) return Response.json({ error: "story_not_found" }, { status: 404 });

  const [nodesResult, jobsResult, audioResult] = await Promise.all([
    supabase.from("story_nodes")
      .select("id,parent_node_id,node_version,text,text_segments,summary,status,created_at,story_choices(id,label,intent,risk_hint,branch_seed,selected_at)")
      .eq("story_id", id).order("created_at", { ascending: true }),
    supabase.from("generation_jobs")
      .select("id,job_type,status,stage,attempt,error_code,error_message_safe,created_at,updated_at")
      .eq("story_id", id).order("created_at", { ascending: false }).limit(10),
    supabase.from("audio_assets")
      .select("id,node_id,status,provider,voice_id,object_key,duration_ms,timestamps,updated_at")
      .eq("story_id", id).eq("status", "ready"),
  ]);

  if (nodesResult.error || jobsResult.error || audioResult.error) {
    return Response.json({ error: "story_details_unavailable" }, { status: 503 });
  }

  const admin = createAdminClient();
  const audioBucket = process.env.GENERATED_AUDIO_BUCKET ?? "generated-audio";
  const audioAssets = await Promise.all((audioResult.data ?? []).map(async (asset) => {
    if (!asset.object_key) return { ...asset, audio_url: null };
    const signed = await admin.storage.from(audioBucket).createSignedUrl(asset.object_key, 3600);
    return { ...asset, audio_url: signed.data?.signedUrl ?? null };
  }));

  return Response.json({ story: storyResult.data, nodes: nodesResult.data ?? [], jobs: jobsResult.data ?? [], audioAssets });
}
