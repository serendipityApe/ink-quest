import { getUser } from "@/lib/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { uuid } from "@/lib/billing/creem";
export async function GET(request: Request) {
  const user = await getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("requestId");
  if (!uuid(id)) return Response.json({ error: "invalid_request" }, { status: 400 });
  const { data, error } = await createAdminClient().from("creem_checkout_intents").select("status").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (error) return Response.json({ error: "receipt_unavailable" }, { status: 503 });
  return Response.json({ paid: data?.status === "completed" }, { headers: { "Cache-Control": "private, no-store" } });
}
