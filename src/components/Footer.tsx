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

  return null;
}
