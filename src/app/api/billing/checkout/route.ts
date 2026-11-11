import { getBillingProduct } from "@/lib/billing/catalog";
import { createLemonSqueezyCheckout } from "@/lib/billing/lemonsqueezy";
import { getUser } from "@/lib/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { creditProduct, creemRequest, sameOrigin, record, uuid, validCheckoutUrl } from "@/lib/billing/creem";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "invalid_origin" }, { status: 403 });
  const user = await getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!user.email_confirmed_at) return Response.json({ error: "email_verification_required" }, { status: 403 });
  let body: { productCode?: unknown; requestId?: unknown };
  try { body = record(await request.json()); } catch { return Response.json({ error: "invalid_json" }, { status: 400 }); }
  // Legacy membership is a separate product; never map it to generation credits.
  if (body.productCode === "premium_monthly") {
    const legacy = getBillingProduct("premium_monthly");
    if (!legacy) return Response.json({ error: "product_unavailable" }, { status: 503 });
    try {
      const origin = new URL(process.env.NEXT_PUBLIC_SITE_URL || request.url).origin;
      const url = await createLemonSqueezyCheckout({ product: legacy, userId: user.id, email: user.email, redirectUrl: `${origin}/subscribe?legacy=return` });
      return Response.json({ url });
    } catch { return Response.json({ error: "checkout_unavailable" }, { status: 502 }); }
  }
  const product = creditProduct(typeof body.productCode === "string" ? body.productCode : "");
  if (!product) return Response.json({ error: "product_unavailable" }, { status: 503 });
  if (!uuid(body.requestId)) return Response.json({ error: "request_id_required" }, { status: 400 });
  try {
    const admin = createAdminClient();
    const { data: intent, error: intentError } = await admin.rpc("create_creem_checkout_intent", { p_user_id: user.id, p_product_code: product.code, p_request_id: body.requestId });
    if (intentError) {
      const code = intentError.message.includes("subscription_already_exists") ? "subscription_already_active" : "checkout_unavailable";
      return Response.json({ error: code }, { status: 409 });
    }
    if (!intent || intent.status !== "pending") return Response.json({ error: "request_closed" }, { status: 409 });
    if (validCheckoutUrl(intent.provider_checkout_url)) return Response.json({ url: intent.provider_checkout_url });
    const requestId = intent.id as string;
    // Claim once before the external request. An uncertain provider response must
    // not create another checkout automatically, even after a client retry.
    const started = await admin.from("creem_checkout_intents").update({ provider_request_started_at: new Date().toISOString() })
      .eq("id", requestId).is("provider_request_started_at", null).select("id");
    if (started.error) throw started.error;
    if (!started.data?.length) return Response.json({ error: "checkout_pending_confirmation" }, { status: 409 });
    const origin = new URL(process.env.NEXT_PUBLIC_SITE_URL || request.url).origin;
    const result = await creemRequest("checkouts", {
      product_id: product.id, request_id: requestId,
      success_url: `${origin}/subscribe?checkout=return&requestId=${requestId}`,
      customer: { email: user.email },
      metadata: { supabase_user_id: user.id, product_code: product.code, request_id: requestId },
    });
    if (!validCheckoutUrl(result.checkout_url) || typeof result.id !== "string") throw new Error("invalid_checkout_response");
    const saved = await admin.from("creem_checkout_intents").update({ provider_checkout_id: result.id, provider_checkout_url: result.checkout_url }).eq("id", requestId).eq("user_id", user.id);
    if (saved.error) throw saved.error;
    return Response.json({ url: result.checkout_url });
  } catch { console.error("Creem checkout unavailable"); return Response.json({ error: "checkout_unavailable" }, { status: 502 }); }
}
