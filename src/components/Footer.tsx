"use client";

import Link from "next/link";
import { useTranslations } from "@/i18n/I18nProvider";

interface FooterProps {
  variant?: "default" | "reader";
  backLabel?: string;
}

export default function Footer({ variant = "default", backLabel = "Back to library" }: FooterProps) {
  const { lang } = useTranslations();
  const isZh = lang === "zh";
  if (variant === "reader") {
    return (
      <footer className="bg-paper pb-8">
        <div className="hallmark-shell">
          <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-4 border-t border-rule pt-5 text-sm">
            <Link prefetch={false} href="/stories" className="inline-flex min-h-11 items-center gap-2 font-semibold whitespace-nowrap hover:text-primary">
              <span aria-hidden="true">←</span>
              {backLabel}
            </Link>
            <nav className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 text-xs text-muted" aria-label="Legal">
              <Link prefetch={false} href="/acceptable-use" className="inline-flex min-h-11 items-center whitespace-nowrap hover:text-primary">{lang === "zh" ? "使用规则" : "Acceptable use"}</Link>
              <Link prefetch={false} href="/terms" className="inline-flex min-h-11 items-center whitespace-nowrap hover:text-primary">{isZh ? "服务条款" : "Terms"}</Link>
              <Link prefetch={false} href="/privacy" className="inline-flex min-h-11 items-center whitespace-nowrap hover:text-primary">{isZh ? "隐私政策" : "Privacy"}</Link>
              <Link prefetch={false} href="/refund" className="inline-flex min-h-11 items-center whitespace-nowrap hover:text-primary">{isZh ? "退款政策" : "Refunds"}</Link>
            </nav>
          </div>
        </div>
      </footer>
    );
  }

  return (
    <footer className="border-t-2 border-ink bg-ink py-8 text-paper">
      <div className="hallmark-shell flex flex-col gap-5 text-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link prefetch={false} href="/" className="font-display text-lg font-bold tracking-[-0.04em] hover:text-accent">InkQuest</Link>
          <p className="mt-1 text-xs text-paper-3">{isZh ? "为语言学习者打造的互动中文故事" : "Interactive Chinese stories for language learners."}</p>
        </div>
        <nav className="flex flex-wrap gap-x-5 gap-y-3 text-sm" aria-label="Legal and support">
          <Link prefetch={false} href="/subscribe" className="inline-flex min-h-11 items-center whitespace-nowrap hover:text-accent">{lang === "zh" ? "订阅价格" : "Pricing"}</Link>
          <Link prefetch={false} href="/acceptable-use" className="inline-flex min-h-11 items-center whitespace-nowrap hover:text-accent">{lang === "zh" ? "使用规则" : "Acceptable use"}</Link>
          <Link prefetch={false} href="/terms" className="inline-flex min-h-11 items-center whitespace-nowrap hover:text-accent">{isZh ? "服务条款" : "Terms"}</Link>
          <Link prefetch={false} href="/privacy" className="inline-flex min-h-11 items-center whitespace-nowrap hover:text-accent">{isZh ? "隐私政策" : "Privacy"}</Link>
          <Link prefetch={false} href="/refund" className="inline-flex min-h-11 items-center whitespace-nowrap hover:text-accent">{isZh ? "退款政策" : "Refunds"}</Link>
          <a href="mailto:xiaowangtongxuehhh@gmail.com" className="inline-flex min-h-11 items-center whitespace-nowrap hover:text-accent">{isZh ? "联系我们" : "Contact"}</a>
        </nav>
      </div>
    </footer>
  );
}
