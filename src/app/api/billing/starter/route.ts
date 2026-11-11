import { createHmac } from "node:crypto";
import { getUser } from "@/lib/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { sameOrigin } from "@/lib/billing/creem";
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "invalid_origin" }, { status: 403 });
  const user = await getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!user.email_confirmed_at) return Response.json({ error: "email_verification_required" }, { status: 403 });
  const secret = process.env.CREEM_WEBHOOK_SECRET;
  const ip = request.headers.get("cf-connecting-ip");
  if (!secret || !ip) return Response.json({ error: "starter_temporarily_unavailable" }, { status: 503 });
  const riskKey = createHmac("sha256", secret).update(`starter:${ip}`).digest("hex");
  try {
    const { data, error } = await createAdminClient().rpc("claim_starter_credits", { p_user_id: user.id, p_risk_key: riskKey });
    if (error) throw error;
    return Response.json({ available: data }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "starter_unavailable_or_ineligible" }, { status: 409 }); }
}
