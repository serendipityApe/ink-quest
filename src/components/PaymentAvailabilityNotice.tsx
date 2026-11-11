"use client";

import { useEffect, useState } from "react";

/** Public availability only; never creates a checkout or reads a balance. */
export default function PaymentAvailabilityNotice({ isZh }: { isZh: boolean }) {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/billing/config", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((config) => {
        if (active) setAvailable(config?.checkoutEnabled === true);
      })
      .catch(() => { /* Keep the conservative notice if availability is unknown. */ });
    return () => { active = false; };
  }, []);

  if (available) return null;
  return (
    <p className="mt-4 rounded-lg border border-rule bg-paper px-4 py-3 text-sm font-semibold text-ink-2" role="status">
      {isZh
        ? "支付验证中，付费购买暂未开放。以下为计划价格，免费故事仍可阅读。"
        : "Paid purchases are not yet available while payment testing is in progress. Prices below are planned; free stories remain available."}
    </p>
  );
}
