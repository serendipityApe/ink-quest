import { getUser } from "@/lib/dal";
import { getBillingProduct } from "@/lib/billing/catalog";
import { createLemonSqueezyCheckout } from "@/lib/billing/lemonsqueezy";

export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  let productCode = "";
  try {
    const body = await request.json() as { productCode?: unknown };
    if (typeof body.productCode === "string") productCode = body.productCode;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const product = getBillingProduct(productCode);
  if (!product) return Response.json({ error: "product_unavailable" }, { status: 503 });

  try {
    const requestUrl = new URL(request.url);
    const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    const siteOrigin = configuredSiteUrl ? new URL(configuredSiteUrl).origin : requestUrl.origin;
    const url = await createLemonSqueezyCheckout({
      product,
      userId: user.id,
      email: user.email,
      redirectUrl: `${siteOrigin}/subscribe?checkout=return`,
    });
    return Response.json({ url });
  } catch (error) {
    console.error("Checkout creation failed", error);
    return Response.json({ error: "checkout_unavailable" }, { status: 502 });
  }
}
