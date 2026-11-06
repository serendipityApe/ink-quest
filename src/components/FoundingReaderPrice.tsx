"use client";

import { useTranslations } from "@/i18n/I18nProvider";

// Official monthly price confirmed by the store owner on November 6, 2026.
// Display only: payment-provider product configuration is not changed here.
export default function FoundingReaderPrice() {
  const { lang } = useTranslations();
  return <span>US$6 <span className="text-base font-normal">{lang === "zh" ? "/ 月（美元）" : "/ month (USD)"}</span></span>;
}
