import { enqueueGenerationJob } from "@/lib/generation/queue";
import { createAdminClient } from "@/lib/supabase/admin";

function isAuthorized(request: Request) {
  const secret = process.env.GENERATION_DISPATCH_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const recoveryResult = await admin.rpc("recover_expired_generation_jobs", { p_limit: 25 });
  if (recoveryResult.error) console.error("Unable to recover expired generation jobs", recoveryResult.error);
  const { data: rows, error } = await admin.from("job_outbox")
    .select("job_id,attempts")
    .eq("status", "pending")
    .lte("next_attempt_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(25);

  if (error) {
    console.error("Unable to read generation outbox", error);
    return Response.json({ error: "outbox_unavailable" }, { status: 503 });
  }

  let dispatched = 0;
  for (const row of rows ?? []) {
    const queued = await enqueueGenerationJob(row.job_id);
    const nextAttemptAt = new Date(Date.now() + (queued ? 5 * 60_000 : 60_000)).toISOString();
    const updateResult = await admin.from("job_outbox").update({
      attempts: row.attempts + 1,
      next_attempt_at: nextAttemptAt,
    }).eq("job_id", row.job_id).eq("status", "pending");
    if (updateResult.error) console.error("Unable to update outbox attempt", updateResult.error);
    if (queued) dispatched++;
  }

  return Response.json({ recovered: recoveryResult.data ?? 0, scanned: rows?.length ?? 0, dispatched });
}
