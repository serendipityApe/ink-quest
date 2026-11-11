import { createAdminClient } from "@/lib/supabase/admin";
import { creditProductById, creemMode, record, resourceId, uuid, verifyCreemSignature } from "@/lib/billing/creem";
import { normalizePayment } from "@/lib/billing/creem-events";

export async function POST(request: Request) {
  const secret = process.env.CREEM_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: "webhook_unavailable" }, { status: 503 });
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > 262144) return new Response(null, { status: 413 });
  const raw = await request.text();
  if (raw.length > 262144) return new Response(null, { status: 413 });
  if (!verifyCreemSignature(raw, request.headers.get("creem-signature") ?? "", secret)) return Response.json({ error: "invalid_signature" }, { status: 401 });
  let event: Record<string, unknown>;
  try { event = record(JSON.parse(raw)); } catch { return Response.json({ error: "invalid_json" }, { status: 400 }); }
  if (typeof event.id !== "string" || typeof event.eventType !== "string") return Response.json({ error: "invalid_event" }, { status: 400 });
  const object = record(event.object);
  const expectedMode = creemMode();
  if (object.mode !== expectedMode && !(expectedMode === "test" && object.mode === "sandbox")) return Response.json({ error: "wrong_mode" }, { status: 400 });
  const admin = createAdminClient();
  try {
    if (["refund.created", "dispute.created"].includes(event.eventType)) {
      if (event.eventType === "refund.created" && object.status !== "succeeded") return Response.json({ received: true });
      const transaction = record(object.transaction); const orderId = resourceId(object.order) || resourceId(transaction.order);
      if (!orderId) throw new Error("missing_order");
      const reversed = await admin.rpc("reverse_creem_payment", { p_event_id: event.id, p_order_id: orderId, p_refunded_amount: event.eventType === "dispute.created" ? transaction.amount_paid : transaction.refunded_amount, p_paid_amount: transaction.amount_paid, p_reason: event.eventType });
      if (reversed.error) throw reversed.error;
      return Response.json({ received: true });
    }
    const product = creditProductById(resourceId(object.product));
    // Existing Founding Reader events are deliberately not remapped to generation credits.
    if (!product) return Response.json({ received: true, ignored: true });
    if (event.eventType.startsWith("subscription.")) {
      const meta = record(object.metadata);
      if (!uuid(meta.supabase_user_id) || !meta.product_code) {
        const binding = await admin.from("creem_subscriptions").select("user_id,product_code").eq("provider_subscription_id", resourceId(object)).maybeSingle();
        if (binding.error) throw binding.error;
        if (binding.data) object.metadata = { ...meta, supabase_user_id: meta.supabase_user_id ?? binding.data.user_id, product_code: meta.product_code ?? binding.data.product_code };
      }
    }
    const payment = normalizePayment(event, product);
    if (payment) {
      const result = await admin.rpc("fulfill_creem_payment", {
        p_event_id: payment.eventId, p_order_id: payment.orderId, p_user_id: payment.userId,
        p_product_code: payment.productCode, p_request_id: payment.requestId, p_subscription_id: payment.subscriptionId,
        p_period_start: payment.periodStart, p_period_end: payment.periodEnd, p_customer_id: payment.customerId,
      });
      if (result.error) throw result.error;
    }
    if (event.eventType.startsWith("subscription.")) {
      const meta = record(object.metadata);
      if (!uuid(meta.supabase_user_id)) throw new Error("subscription_identity_missing");
      const result = await admin.rpc("sync_creem_subscription", {
        p_event_id: event.id, p_user_id: meta.supabase_user_id,
        p_request_id: uuid(meta.request_id) ? meta.request_id : null,
        p_period_start: typeof object.current_period_start_date === "string" ? object.current_period_start_date : null,
        p_customer_id: resourceId(object.customer),
        p_subscription_id: resourceId(object), p_status: event.eventType === "subscription.scheduled_cancel" ? "scheduled_cancel" : event.eventType === "subscription.expired" ? "expired" : String(object.status ?? "unknown"),
        p_event_at: new Date(typeof object.updated_at === "string" ? object.updated_at : Number(event.created_at)).toISOString(),
        p_period_end: typeof object.current_period_end_date === "string" ? object.current_period_end_date : null,
      });
      if (result.error) throw result.error;
    }
    return Response.json({ received: true });
  } catch {
    console.error("Creem fulfillment failed", { eventId: event.id, eventType: event.eventType });
    return Response.json({ error: "fulfillment_failed" }, { status: 503 });
  }
}
