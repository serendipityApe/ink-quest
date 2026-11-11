import { creemCheckoutEnabled } from "@/lib/billing/creem";
export async function GET() {
  return Response.json({ checkoutEnabled: creemCheckoutEnabled() }, { headers: { "Cache-Control": "no-store" } });
}
