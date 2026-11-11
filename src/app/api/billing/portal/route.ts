import { getUser } from "@/lib/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { creemRequest, sameOrigin, validCheckoutUrl } from "@/lib/billing/creem";
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "invalid_origin" }, { status: 403 });
  const user = await getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    const { data, error } = await createAdminClient().from("creem_subscriptions").select("provider_customer_id").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    if (!data?.provider_customer_id) return Response.json({ error: "no_subscription" }, { status: 404 });
    const result = await creemRequest("customers/billing", { customer_id: data.provider_customer_id });
    if (!validCheckoutUrl(result.customer_portal_link)) throw new Error("invalid_portal");
    return Response.json({ url: result.customer_portal_link });
  } catch { return Response.json({ error: "portal_unavailable" }, { status: 503 }); }
}
