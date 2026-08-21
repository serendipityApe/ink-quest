"use client";

import Link from "next/link";
import { useTranslations } from "@/i18n/I18nProvider";

interface FooterProps {
  variant?: "default" | "reader";
  backLabel?: string;
}

export default function Footer({ variant = "default", backLabel = "Back to library" }: FooterProps) {
  const { lang } = useTranslations();

  if (variant === "reader") {
    return (
      <footer className="bg-paper pb-8">
        <div className="hallmark-shell">
          <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 border-t border-rule pt-5 text-sm">
            <Link href="/stories" className="inline-flex min-h-11 items-center gap-2 font-semibold whitespace-nowrap hover:text-primary">
              <span aria-hidden="true">←</span>
              {backLabel}
            </Link>
            <Link href="/" className="font-display font-bold tracking-[-0.04em] whitespace-nowrap hover:text-primary">InkQuest</Link>
          </div>
        </div>
      </footer>
    );
  }

  return (
    <footer className="mt-auto bg-paper py-16 md:py-24">
      <div className="hallmark-shell">
        <p className="hallmark-display mb-16 max-w-[24ch] text-[clamp(2rem,5vw,4rem)]">{lang === "zh" ? "学语言，是为了走进原本进不去的故事。" : "Language is how you enter stories you could not reach before."}</p>
        <div className="grid gap-6 border-t-2 border-ink pt-6 md:grid-cols-[1fr_auto] md:items-end">
          <div><strong className="font-display text-lg tracking-[-0.04em]">InkQuest</strong><p className="mt-1 text-sm text-muted">© 2026 InkQuest. Built for independent language hackers.</p></div>
          <nav className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Footer navigation">
            <Link href="/stories" className="inline-flex min-h-11 items-center text-sm font-semibold whitespace-nowrap hover:text-primary">Stories</Link>
            <Link href="/saved-words" className="inline-flex min-h-11 items-center text-sm font-semibold whitespace-nowrap hover:text-primary">Saved words</Link>
            <Link href="/subscribe" className="inline-flex min-h-11 items-center text-sm font-semibold whitespace-nowrap hover:text-primary">Membership</Link>
            <a href="https://discord.com" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm font-semibold whitespace-nowrap hover:text-primary">Discord</a>
          </nav>
        </div>
      </div>
    </footer>
  );
}
