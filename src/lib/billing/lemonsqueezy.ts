import type { BillingProduct } from "./catalog";

interface CheckoutInput {
  product: BillingProduct;
  userId: string;
  email?: string;
  redirectUrl: string;
}

export async function createLemonSqueezyCheckout(input: CheckoutInput) {
  const apiKey = process.env.LEMONSQUEEZY_API_KEY;
  const storeId = process.env.LEMONSQUEEZY_STORE_ID;
  if (!apiKey || !storeId) {
    throw new Error("Lemon Squeezy checkout environment variables are not configured.");
  }

  const response = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
    method: "POST",
    headers: {
      Accept: "application/vnd.api+json",
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/vnd.api+json",
    },
    body: JSON.stringify({
      data: {
        type: "checkouts",
        attributes: {
          checkout_data: {
            email: input.email,
            custom: {
              supabase_user_id: input.userId,
              product_code: input.product.code,
            },
          },
          product_options: {
            redirect_url: input.redirectUrl,
          },
        },
        relationships: {
          store: { data: { type: "stores", id: storeId } },
          variant: { data: { type: "variants", id: input.product.variantId } },
        },
      },
    }),
    cache: "no-store",
  });

  const body = await response.json() as {
    data?: { attributes?: { url?: string } };
    errors?: Array<{ detail?: string }>;
  };
  const checkoutUrl = body.data?.attributes?.url;
  if (!response.ok || !checkoutUrl) {
    throw new Error(body.errors?.[0]?.detail ?? "Lemon Squeezy checkout creation failed.");
  }

  return checkoutUrl;
}
