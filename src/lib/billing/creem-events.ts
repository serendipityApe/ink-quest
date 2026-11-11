// Payload fields are documented at https://docs.creem.io/code/webhooks.
import { record, resourceId, uuid, type CreditProduct } from "./creem";
export interface CreditPayment { eventId: string; orderId: string; userId: string; requestId: string | null; productCode: string; subscriptionId: string | null; customerId: string; periodStart: string | null; periodEnd: string | null }
function date(value: unknown) { const d = typeof value === "number" || typeof value === "string" ? new Date(value) : null; return d && Number.isFinite(d.getTime()) ? d.toISOString() : null; }
export function normalizePayment(event: Record<string, unknown>, product: CreditProduct): CreditPayment | null {
  const object = record(event.object); const meta = record(object.metadata);
  const type = event.eventType;
  if (type === "checkout.completed" && product.recurring) return null;
  if (type !== "checkout.completed" && type !== "subscription.paid") return null;
  if (type === "subscription.paid" && !product.recurring) throw new Error("product_type_mismatch");
  const payment = type === "subscription.paid" ? record(object.last_transaction) : record(object.order);
  if (payment.status !== "paid" || (type === "checkout.completed" && object.status !== "completed")) throw new Error("payment_not_paid");
  if (payment.product && resourceId(payment.product) !== product.id) throw new Error("payment_product_mismatch");
  if (Array.isArray(object.items) && object.items.some(item => record(item).units !== 1 || record(item).product_id !== product.id)) throw new Error("subscription_items_mismatch");
  const orderId = type === "subscription.paid" ? resourceId(payment.order) : resourceId(payment);
  const requestId = typeof meta.request_id === "string" ? meta.request_id : object.request_id;
  const amount = payment.amount;
  if (!orderId || payment.currency !== "USD" || typeof amount !== "number" || amount !== product.price || (object.units !== undefined && object.units !== 1)) throw new Error("payment_amount_mismatch");
  if (!uuid(meta.supabase_user_id) || meta.product_code !== product.code || (requestId !== undefined && !uuid(requestId))) throw new Error("invalid_payment_identity");
  const periodStart = product.recurring ? date(payment.period_start ?? object.current_period_start_date) : null;
  const periodEnd = product.recurring ? date(payment.period_end ?? object.current_period_end_date) : null;
  if (product.recurring && (!periodStart || !periodEnd || periodEnd <= periodStart)) throw new Error("invalid_period");
  return { eventId: String(event.id), orderId, userId: meta.supabase_user_id, requestId: uuid(requestId) ? requestId : null, productCode: product.code,
    subscriptionId: product.recurring ? resourceId(object) : null, customerId: resourceId(object.customer), periodStart, periodEnd };
}
