import { getUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  const user = await getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { jobId } = await context.params;
  const supabase = await createClient();

  const jobResult = await supabase.from("generation_jobs")
    .select("id,story_id,node_id,job_type,status,stage,attempt,max_attempts,error_code,error_message_safe,created_at,updated_at")
    .eq("id", jobId).eq("user_id", user.id).maybeSingle();

  if (jobResult.error) {
    console.error("Generated story job query failed", { jobId, code: jobResult.error.code, message: jobResult.error.message });
    return Response.json({ error: "job_unavailable" }, { status: 503 });
  }
  if (!jobResult.data) return Response.json({ error: "job_not_found" }, { status: 404 });

  const eventsResult = await supabase.from("generation_job_events")
    .select("id,event_type,payload,created_at")
    .eq("job_id", jobId).order("id", { ascending: true });
  if (eventsResult.error) return Response.json({ error: "job_events_unavailable" }, { status: 503 });

  return Response.json({ job: jobResult.data, events: eventsResult.data ?? [] });
}
