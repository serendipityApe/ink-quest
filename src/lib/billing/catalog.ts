export type BillingProductCode = "premium_monthly" | "credits_small";

export interface BillingProduct {
  code: BillingProductCode;
  type: "subscription" | "credit_pack";
  variantId: string;
  creditGrant: number;
}

function readCreditGrant(name: string) {
  const value = Number(process.env[name] ?? "0");
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export function getBillingProduct(code: string): BillingProduct | null {
  if (code === "premium_monthly") {
    const variantId = process.env.LEMONSQUEEZY_SUBSCRIPTION_VARIANT_ID;
    if (!variantId) return null;
    return {
      code,
      type: "subscription",
      variantId,
      creditGrant: readCreditGrant("LEMONSQUEEZY_SUBSCRIPTION_CREDIT_GRANT"),
    };
  }

  if (code === "credits_small") {
    const variantId = process.env.LEMONSQUEEZY_CREDIT_PACK_VARIANT_ID;
    if (!variantId) return null;
    return {
      code,
      type: "credit_pack",
      variantId,
      creditGrant: readCreditGrant("LEMONSQUEEZY_CREDIT_PACK_GRANT"),
    };
  }

  return null;
}

export function getBillingProductByVariant(variantId: string) {
  return ["premium_monthly", "credits_small"]
    .map(getBillingProduct)
    .find((product): product is BillingProduct => product?.variantId === variantId) ?? null;
}
