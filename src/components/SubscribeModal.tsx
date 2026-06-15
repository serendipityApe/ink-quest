"use client";

import { useEffect, useState } from "react";
import { Lock, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

interface SubscribeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SubscribeModal({ isOpen, onClose }: SubscribeModalProps) {
  const [user, setUser] = useState<User | null>(null);
  const checkoutUrl = process.env.NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL;

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = "hidden";
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user));
    return () => { document.body.style.overflow = "unset"; };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCheckout = () => {
    if (!user) {
      window.location.href = `/login?next=/subscribe`;
      return;
    }
    const url = checkoutUrl
      ? `${checkoutUrl}?checkout[email]=${encodeURIComponent(user.email ?? "")}`
      : "#";
    window.open(url, "_blank");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#3a6664]/10 backdrop-blur-2xl transition-opacity duration-300" onClick={onClose} />
      <div className="relative max-w-md w-full flex flex-col items-center text-center p-8 md:p-12 bg-surface/50 rounded-3xl border border-white/30 glass-panel shadow-2xl animate-in scale-in duration-300 z-10">
        <button onClick={onClose} className="absolute top-4 right-4 text-on-surface-variant/60 hover:text-on-surface transition-colors p-2 rounded-full hover:bg-surface-container" aria-label="Close modal">
          <X className="h-5 w-5" />
        </button>

        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-6 animate-bounce">
          <Lock className="h-8 w-8" />
        </div>
        <h2 className="font-story-title-lg text-3xl text-on-surface mb-4">Unlock the Full Adventure</h2>
        <p className="font-ui-body text-ui-body text-secondary mb-8 leading-relaxed">
          Get unlimited access to 10+ new interactive Xianxia, Cyberpunk, and Sci-Fi web novels every month.
          <br />
          <span className="font-semibold text-primary mt-2 block text-xl">$9.9 / Month</span>
        </p>
        <button
          onClick={handleCheckout}
          className="w-full font-button-text text-button-text text-primary uppercase tracking-widest hover:bg-primary hover:text-white transition-all py-4 px-8 border border-primary/20 rounded-full bg-primary/5 flex items-center justify-center gap-2 cursor-pointer active:scale-98"
        >
          {user ? "[ Subscribe Now ]" : "[ Sign In to Subscribe ]"}
        </button>
        <p className="font-ui-pinyin-sm text-[12px] text-secondary/70 mt-4">Cancel anytime. 7-day money-back guarantee.</p>
      </div>
    </div>
  );
}
