"use client";

import Image from "next/image";
import { useState } from "react";
import { BookOpen } from "lucide-react";

/** Shared ink-on-paper cover treatment for the home shelf and library. */
export default function StoryCover({ src, title, position, sizes }: { src: string; title: string; position?: string; sizes: string }) {
  const [fallback, setFallback] = useState(false);
  const [failed, setFailed] = useState(false);
  const local = src.match(/^https?:\/\/[^?#]+(\/covers\/[^?#]+)(?:[?#].*)?$/)?.[1];
  const crop = src.includes("seven-oclock") ? { transform: "scale(1.65)", transformOrigin: "65% 85%" } : src.includes("receipt-from-tomorrow") ? { transform: "scale(1.5)", transformOrigin: "70% 70%" } : {};
  return <div className="iq-cover absolute inset-0">
    {failed ? <div role="img" aria-label={title} className="grid h-full place-items-center p-6 text-center text-muted"><BookOpen className="size-12" aria-hidden="true" /></div> : <Image src={fallback && local ? local : src} alt={title} fill sizes={sizes} style={{ objectPosition: position, ...crop }} className="object-cover" onError={() => { if (local && !fallback) setFallback(true); else setFailed(true); }} />}
  </div>;
}
