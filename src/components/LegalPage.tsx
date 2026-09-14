import type { ReactNode } from "react";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";

interface LegalPageProps {
  eyebrow: string;
  title: string;
  summary: string;
  children: ReactNode;
}

export default function LegalPage({ eyebrow, title, summary, children }: LegalPageProps) {
  return (
    <>
      <Navbar />
      <main className="hallmark-shell py-12 md:py-20">
        <article className="mx-auto max-w-3xl">
          <header className="border-b-2 border-ink pb-8">
            <p className="hallmark-eyebrow text-accent-deep">{eyebrow}</p>
            <h1 className="hallmark-display mt-4 text-[clamp(2.75rem,7vw,5rem)]">{title}</h1>
            <p className="mt-6 max-w-[62ch] text-lg leading-relaxed text-ink-2">{summary}</p>
            <p className="mt-5 font-outlier text-xs text-muted">Effective September 14, 2026</p>
          </header>
          <div className="legal-copy py-10">{children}</div>
        </article>
      </main>
      <Footer />
    </>
  );
}
