import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { getBillingProduct, getBillingProductByVariant } from "@/lib/billing/catalog";
import { createAdminClient } from "@/lib/supabase/admin";

interface LemonEvent {
  meta?: { event_name?: string; custom_data?: Record<string, unknown> };
  data?: { id?: string | number; type?: string; attributes?: Record<string, unknown> };
}

function verifySignature(payload: string, signature: string) {
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  if (!secret) throw new Error("LEMONSQUEEZY_WEBHOOK_SECRET is not configured.");
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function nullableString(value: unknown) {
  return stringValue(value) || null;
}

function subscriptionHasAccess(status: string, endsAt: string | null) {
  if (["active", "on_trial"].includes(status)) return true;
  return status === "cancelled" && Boolean(endsAt) && new Date(endsAt as string).getTime() > Date.now();
}

export async function POST(request: Request) {
  const payload = await request.text();
  const signature = request.headers.get("x-signature") ?? "";

  try {
    if (!verifySignature(payload, signature)) {
      return Response.json({ error: "invalid_signature" }, { status: 401 });
    }
  } catch (error) {
    console.error("Webhook verification unavailable", error);
    return Response.json({ error: "webhook_unavailable" }, { status: 503 });
  }

  let event: LemonEvent;
  try {
    event = JSON.parse(payload) as LemonEvent;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const eventId = createHash("sha256").update(payload).digest("hex");
  const eventName = event.meta?.event_name ?? "unknown";
  const admin = createAdminClient();
  const insertResult = await admin.from("billing_events").insert({
    provider_event_id: eventId,
    event_name: eventName,
    payload: event,
  });

  if (insertResult.error && insertResult.error.code !== "23505") {
    console.error("Unable to persist billing event", insertResult.error);
    return Response.json({ error: "webhook_persistence_failed" }, { status: 503 });
  }

  if (insertResult.error?.code === "23505") {
    const existing = await admin.from("billing_events").select("status,attempts")
      .eq("provider_event_id", eventId).single();
    if (existing.data?.status === "processed") {
      return Response.json({ received: true, duplicate: true });
    }
    await admin.from("billing_events").update({
      status: "received",
      attempts: (existing.data?.attempts ?? 0) + 1,
      error_message: null,
    }).eq("provider_event_id", eventId);
  }

  try {
    const attributes = event.data?.attributes ?? {};
    const dataType = event.data?.type ?? "";
    const providerId = stringValue(event.data?.id);
    const userId = stringValue(event.meta?.custom_data?.supabase_user_id);
    const requestedProductCode = stringValue(event.meta?.custom_data?.product_code);
    const variantId = stringValue(attributes.variant_id);
    const productByCode = getBillingProduct(requestedProductCode);
    const productByVariant = getBillingProductByVariant(variantId);
    const product = productByCode && productByVariant?.code === productByCode.code ? productByCode : null;
    const isBillingResource = dataType === "subscriptions" || dataType === "orders";

    if (isBillingResource && (!isUuid(userId) || !providerId || !product)) {
      throw new Error("Billing identity or product metadata is invalid.");
    }

    if (dataType === "subscriptions" && product?.type === "subscription") {
      const status = stringValue(attributes.status) || "unknown";
      const endsAt = nullableString(attributes.ends_at);
      const customerId = stringValue(attributes.customer_id);

      if (customerId) {
        const customerResult = await admin.from("billing_customers").upsert({
          user_id: userId,
          provider: "lemonsqueezy",
          provider_customer_id: customerId,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
        if (customerResult.error) throw customerResult.error;
      }

      const subscriptionResult = await admin.from("billing_subscriptions").upsert({
        user_id: userId,
        provider_subscription_id: providerId,
        variant_id: variantId,
        status,
        renews_at: nullableString(attributes.renews_at),
        ends_at: endsAt,
        updated_at: new Date().toISOString(),
      }, { onConflict: "provider_subscription_id" });
      if (subscriptionResult.error) throw subscriptionResult.error;

      const subscriptionsResult = await admin.from("billing_subscriptions")
        .select("status,ends_at").eq("user_id", userId);
      if (subscriptionsResult.error) throw subscriptionsResult.error;
      const hasPremiumAccess = (subscriptionsResult.data ?? []).some((subscription) =>
        subscriptionHasAccess(subscription.status, subscription.ends_at)
      );

      const profileResult = await admin.from("profiles").update({
        is_premium: hasPremiumAccess,
        ls_subscription_id: providerId,
        updated_at: new Date().toISOString(),
      }).eq("id", userId);
      if (profileResult.error) throw profileResult.error;
    }

    if (dataType === "orders" && product) {
      const status = stringValue(attributes.status) || "unknown";
      const total = Number(attributes.total ?? 0);
      const orderResult = await admin.from("billing_orders").upsert({
        user_id: userId,
        provider_order_id: providerId,
        product_code: product.code,
        product_type: product.type,
        variant_id: variantId,
        status,
        currency: nullableString(attributes.currency),
        total_minor: Number.isSafeInteger(total) ? total : null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "provider_order_id" });
      if (orderResult.error) throw orderResult.error;

      if (eventName === "order_created" && status === "paid" && product.creditGrant > 0) {
        const grantResult = await admin.rpc("grant_credits", {
          p_user_id: userId,
          p_amount: product.creditGrant,
          p_source_type: "lemonsqueezy_order",
          p_source_id: providerId,
          p_idempotency_key: `billing:${eventId}:credits`,
          p_metadata: { product_code: product.code, variant_id: variantId },
        });
        if (grantResult.error) throw grantResult.error;
      }
    }

    const processedResult = await admin.from("billing_events").update({
      status: "processed",
      processed_at: new Date().toISOString(),
      error_message: null,
    }).eq("provider_event_id", eventId);
    if (processedResult.error) throw processedResult.error;

    return Response.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown billing event error";
    console.error("Billing event processing failed", { eventId, eventName, error });
    await admin.from("billing_events").update({
      status: "failed",
      error_message: message.slice(0, 1000),
    }).eq("provider_event_id", eventId);
    return Response.json({ error: "webhook_processing_failed" }, { status: 500 });
  }
}
