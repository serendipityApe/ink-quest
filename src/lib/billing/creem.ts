import { createHmac, timingSafeEqual } from "node:crypto";

export type CreditProductCode = "generation_monthly" | "credits_500";
export interface CreditProduct { code: CreditProductCode; id: string; credits: number; price: number; recurring: boolean }
export function creditProduct(code: string): CreditProduct | null {
  const config = code === "generation_monthly" ? { env: "CREEM_GENERATION_MONTHLY_PRODUCT_ID", credits: 1000, price: 600, recurring: true }
    : code === "credits_500" ? { env: "CREEM_CREDITS_500_PRODUCT_ID", credits: 500, price: 500, recurring: false } : null;
  const id = config && process.env[config.env];
  return config && id ? { code: code as CreditProductCode, id, credits: config.credits, price: config.price, recurring: config.recurring } : null;
}
export function creditProductById(id: string) {
  return [creditProduct("generation_monthly"), creditProduct("credits_500")].find(p => p?.id === id) ?? null;
}
export function creemMode() { return process.env.CREEM_MODE === "test" ? "test" : "prod"; }
export async function creemRequest(path: string, body?: unknown) {
  const key = process.env.CREEM_API_KEY;
  if (!key) throw new Error("creem_not_configured");
  const base = creemMode() === "test" ? "https://test-api.creem.io" : "https://api.creem.io";
  const response = await fetch(`${base}/v1/${path}`, {
    method: body ? "POST" : "GET", headers: { "x-api-key": key, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}), cache: "no-store", signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`creem_http_${response.status}`);
  return await response.json() as Record<string, unknown>;
}
export function verifyCreemSignature(payload: string, signature: string, secret: string) {
  if (!secret || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(payload).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}
export function validCheckoutUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try { const u = new URL(value); return !u.username && !u.password && u.protocol === "https:" && (u.hostname === "creem.io" || u.hostname.endsWith(".creem.io")); } catch { return false; }
}
export function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
export function resourceId(value: unknown) { return typeof value === "string" ? value : typeof record(value).id === "string" ? record(value).id as string : ""; }
export function uuid(value: unknown): value is string { return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
export function sameOrigin(request: Request) { const origin = request.headers.get("origin"); return origin !== null && origin === new URL(request.url).origin; }
