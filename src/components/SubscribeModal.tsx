"use client";

import { useEffect, useState } from "react";
import { Lock, X } from "lucide-react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

interface SubscribeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SubscribeModal({ isOpen, onClose }: SubscribeModalProps) {
  const [user, setUser] = useState<User | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = "hidden";

    if (isSupabaseConfigured()) {
      const supabase = createClient();
      supabase.auth.getUser().then(({ data: { user } }) => setUser(user));
    }

    return () => { document.body.style.overflow = "unset"; };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCheckout = async () => {
    if (!user) {
      window.location.href = `/login?next=/subscribe`;
      return;
    }
    setCheckoutLoading(true);
    setCheckoutError("");
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productCode: "premium_monthly" }),
      });
      const body = await response.json() as { url?: string };
      if (!response.ok || !body.url) throw new Error("checkout_unavailable");
      window.location.assign(body.url);
    } catch {
      setCheckoutLoading(false);
      setCheckoutError("Checkout is temporarily unavailable. Please try again.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-ink/45" onClick={onClose} />
      <div className="relative z-10 flex w-full max-w-md flex-col items-center rounded-card border-2 border-ink bg-paper p-8 text-center shadow-[0.75rem_0.75rem_0_var(--color-ink)] md:p-12">
        <button onClick={onClose} className="absolute right-4 top-4 grid size-11 place-items-center rounded-full border border-ink hover:bg-paper-3" aria-label="Close modal">
          <X className="h-5 w-5" />
        </button>

        <div className="mb-6 grid size-16 place-items-center rounded-full border-2 border-ink bg-accent-soft">
          <Lock className="h-8 w-8" />
        </div>
        <h2 className="hallmark-display mb-4 text-3xl">Unlock the Full Adventure</h2>
        <p className="mb-8 font-body leading-relaxed text-ink-2">
          Continue premium branches and unlock the full interactive story archive.
          <br />
          <span className="mt-2 block text-xl font-semibold text-ink">Monthly membership</span>
        </p>
        <button
          onClick={handleCheckout}
          disabled={checkoutLoading}
          aria-busy={checkoutLoading}
          className="hallmark-btn w-full disabled:cursor-not-allowed disabled:opacity-50"
        >
          {checkoutLoading ? "[ Opening Checkout… ]" : user ? "[ Subscribe Now ]" : "[ Sign In to Subscribe ]"}
        </button>
        {checkoutError && <p role="alert" className="mt-4 text-sm text-error">{checkoutError}</p>}
        <p className="mt-4 font-outlier text-[12px] text-muted">Cancel anytime. 7-day money-back guarantee.</p>
      </div>
    </div>
  );
}
