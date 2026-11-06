"use client";

import { useEffect, useState } from "react";
import { Lock, X } from "lucide-react";
import Link from "next/link";
import FoundingReaderPrice from "@/components/FoundingReaderPrice";
import { useTranslations } from "@/i18n/I18nProvider";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

interface SubscribeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SubscribeModal({ isOpen, onClose }: SubscribeModalProps) {
  const { lang } = useTranslations();
  const isZh = lang === "zh";
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
      setCheckoutError(isZh ? "暂时无法打开支付页面，请稍后再试。" : "Checkout is temporarily unavailable. Please try again.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-ink/45" onClick={onClose} />
      <div className="relative z-10 flex w-full max-w-md flex-col items-center rounded-card border-2 border-ink bg-paper p-8 text-center shadow-[0.75rem_0.75rem_0_var(--color-ink)] md:p-12">
        <button onClick={onClose} className="absolute right-4 top-4 grid size-11 place-items-center rounded-full border border-ink hover:bg-paper-3" aria-label={isZh ? "关闭" : "Close modal"}>
          <X className="h-5 w-5" />
        </button>

        <div className="mb-6 grid size-16 place-items-center rounded-full border-2 border-ink bg-accent-soft">
          <Lock className="h-8 w-8" />
        </div>
        <h2 className="hallmark-display mb-4 text-3xl">Founding Reader</h2>
        <p className="mb-8 font-body leading-relaxed text-ink-2">
          {isZh ? "继续阅读会员剧情分支，解锁互动故事库的付费阅读内容。" : "Continue premium story branches and unlock paid reading content in the interactive story library."}
          <br />
          <span className="mt-2 block text-3xl font-semibold text-ink"><FoundingReaderPrice /></span>
        </p>
        <button
          onClick={handleCheckout}
          disabled={checkoutLoading}
          aria-busy={checkoutLoading}
          className="hallmark-btn w-full disabled:cursor-not-allowed disabled:opacity-50"
        >
          {checkoutLoading ? (isZh ? "正在打开支付页面…" : "Opening checkout…") : user ? (isZh ? "立即订阅" : "Subscribe now") : (isZh ? "登录后订阅" : "Sign in to subscribe")}
        </button>
        {checkoutError && <p role="alert" className="mt-4 text-sm text-error">{checkoutError}</p>}
        <p className="mt-4 text-xs text-muted">{isZh ? "按月自动续订，可随时取消。适用税费及最终金额在结账时显示。" : "Renews monthly; cancel anytime. Applicable taxes and the final total are shown at checkout."}</p>
        <Link href="/subscribe" onClick={onClose} className="mt-4 text-sm underline">{isZh ? "订阅详情及退款政策" : "Subscription details and refund policy"}</Link>
      </div>
    </div>
  );
}
