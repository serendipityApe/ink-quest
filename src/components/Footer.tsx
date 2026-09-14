"use client";

import Link from "next/link";

interface FooterProps {
  variant?: "default" | "reader";
  backLabel?: string;
}

export default function Footer({ variant = "default", backLabel = "Back to library" }: FooterProps) {
  if (variant === "reader") {
    return (
      <footer className="bg-paper pb-8">
        <div className="hallmark-shell">
          <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-4 border-t border-rule pt-5 text-sm">
            <Link href="/stories" className="inline-flex min-h-11 items-center gap-2 font-semibold whitespace-nowrap hover:text-primary">
              <span aria-hidden="true">←</span>
              {backLabel}
            </Link>
            <nav className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 text-xs text-muted" aria-label="Legal">
              <Link href="/terms" className="hover:text-primary">Terms</Link>
              <Link href="/privacy" className="hover:text-primary">Privacy</Link>
              <Link href="/refund" className="hover:text-primary">Refunds</Link>
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
          <Link href="/" className="font-display text-lg font-bold tracking-[-0.04em] hover:text-accent">InkQuest</Link>
          <p className="mt-1 text-xs text-paper-3">Interactive Chinese stories for language learners.</p>
        </div>
        <nav className="flex flex-wrap gap-x-5 gap-y-3 text-sm" aria-label="Legal and support">
          <Link href="/terms" className="hover:text-accent">Terms</Link>
          <Link href="/privacy" className="hover:text-accent">Privacy</Link>
          <Link href="/refund" className="hover:text-accent">Refunds</Link>
          <a href="mailto:xiaowangtongxuehhh@gmail.com" className="hover:text-accent">Contact</a>
        </nav>
      </div>
    </footer>
  );
}
