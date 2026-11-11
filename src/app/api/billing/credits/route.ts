import { getUser } from "@/lib/dal";
import { createAdminClient } from "@/lib/supabase/admin";
export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  const user = await getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401, headers });
  try {
    const { data, error } = await createAdminClient().rpc("get_credit_balance", { p_user_id: user.id });
    if (error) throw error;
    return Response.json(data, { headers });
  } catch { return Response.json({ error: "credits_unavailable" }, { status: 503, headers }); }
}
