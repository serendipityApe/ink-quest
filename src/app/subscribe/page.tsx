"use client";

import { useEffect, useState } from "react";
import { Check, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import FoundingReaderPrice from "@/components/FoundingReaderPrice";
import Link from "next/link";
import { useTranslations } from "@/i18n/I18nProvider";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

function SubscribeContent() {
  const router = useRouter();
  const { lang } = useTranslations();
  const isZh = lang === "zh";
  const supabaseConfigured = isSupabaseConfigured();
  const [isCheckoutReturn, setIsCheckoutReturn] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(supabaseConfigured);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [verifiedPremium, setVerifiedPremium] = useState(false);
  const [verifyingPayment, setVerifyingPayment] = useState(false);

  useEffect(() => {
    if (!supabaseConfigured) return;

    let cancelled = false;

    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (cancelled) return;
      setUser(user);
      setLoading(false);
      const checkoutReturned = new URLSearchParams(window.location.search).get("checkout") === "return";
      setIsCheckoutReturn(checkoutReturned);
      if (user && checkoutReturned) {
        setVerifyingPayment(true);
        for (let attempt = 0; attempt < 4; attempt++) {
          const response = await fetch("/api/billing/status", { cache: "no-store" });
          if (response.ok) {
            const status = await response.json() as { premium?: boolean };
            if (status.premium) {
              if (cancelled) return;
              setVerifiedPremium(true);
              break;
            }
          }
          await new Promise((resolve) => setTimeout(resolve, 1200));
        }
      }
      if (cancelled) return;
      setVerifyingPayment(false);
    });
    return () => { cancelled = true; };
  }, [supabaseConfigured]);

  const handleCheckout = async () => {
    if (!user) {
      router.push("/login?next=/subscribe");
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

  const benefits = isZh
    ? ["解锁故事库的会员阅读内容", "带配套音频的故事朗读", "词义查询与生词收藏", "通过选项探索互动剧情"]
    : ["Access to premium reading content in the library", "Narration for stories with available audio", "Word lookup and saved vocabulary", "Interactive choices to explore the story"];

  return (
    <>
      <Navbar />
      <main className="hallmark-shell grid min-h-[70vh] flex-grow place-items-center py-12 md:py-16">
        <section className="w-full max-w-[560px] rounded-card border-[1.5px] border-ink bg-surface-container-lowest p-6 sm:p-10">
          {verifiedPremium ? (
            <div>
              <CheckCircle2 className="size-10 text-accent-deep" aria-hidden="true" />
              <h1 className="hallmark-display mt-6 text-[32px] md:text-[36px]">{isZh ? "欢迎加入！" : "Welcome to InkQuest!"}</h1>
              <p className="mt-4 leading-relaxed text-ink-2">{isZh ? "你的订阅已生效，可以使用会员阅读功能。" : "Your subscription is active. Your member reading access is ready."}</p>
              <button type="button" onClick={() => router.push("/stories")} className="hallmark-btn mt-8 w-full">{isZh ? "进入故事库" : "Enter the library"}</button>
            </div>
          ) : (
            <>
              <p className="hallmark-eyebrow text-muted">{isZh ? "会员" : "Membership"}</p>
              <h1 className="hallmark-display mt-3 text-[32px] md:text-[36px]">{isZh ? "解锁完整冒险" : "Unlock the full adventure"}</h1>
              <p className="mt-3 text-ink-2">{isZh ? "继续阅读会员剧情分支，解锁互动故事库的付费阅读内容。" : "Continue premium story branches and unlock paid reading content in the interactive story library."}</p>
              <div className="mt-6 flex flex-wrap items-end justify-between gap-4 rounded-xl border border-rule bg-paper p-5">
                <div><h2 className="font-bold">Founding Reader</h2><p className="mt-1 text-sm text-muted">{isZh ? "每月续费 · 美元结算" : "Billed monthly in USD"}</p></div>
                <p className="text-3xl font-bold tabular-nums"><FoundingReaderPrice /></p>
              </div>
              <ul className="mt-7 grid gap-4">
                {benefits.map(benefit => <li key={benefit} className="flex gap-3 text-sm leading-relaxed text-ink-2"><Check className="mt-0.5 size-5 shrink-0 text-accent-deep" aria-hidden="true" /><span>{benefit}</span></li>)}
              </ul>
              <button type="button" onClick={handleCheckout} disabled={loading || checkoutLoading} aria-busy={checkoutLoading} className="hallmark-btn mt-8 w-full disabled:cursor-not-allowed disabled:opacity-50">
                {loading ? (isZh ? "正在检查登录状态…" : "Checking sign-in…") : checkoutLoading ? (isZh ? "正在打开支付页面…" : "Opening checkout…") : user ? (isZh ? "立即订阅" : "Subscribe now") : (isZh ? "登录后订阅" : "Sign in to subscribe")}
              </button>
              {checkoutError && <p role="alert" className="mt-4 rounded-input bg-error-soft p-3 text-sm text-error">{checkoutError}</p>}
              {isCheckoutReturn && !verifiedPremium && <p className="mt-4 text-sm text-muted">{verifyingPayment ? (isZh ? "正在确认会员状态…" : "Confirming membership…") : (isZh ? "已从支付页面返回，会员状态确认可能需要一点时间。" : "Checkout returned. Membership confirmation may take a moment.")}</p>}
              <p className="mt-5 text-sm text-muted">{isZh ? "故事生成使用积分，提交前会显示所需积分。" : "Story generation uses credits; the required credits are shown before submission."}</p>
              <p className="mt-4 text-xs leading-relaxed text-muted">{isZh ? "按月自动续订，取消后当前计费周期结束时停止续费。适用税费及最终金额在结账时显示。" : "Renews automatically each month until canceled. Cancellation takes effect at the end of the current billing period. Applicable taxes and the final total are shown at checkout."}</p>
              <p className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm"><Link href="/terms" className="text-accent-deep underline underline-offset-4">{isZh ? "服务条款" : "Terms"}</Link><Link href="/refund" className="text-accent-deep underline underline-offset-4">{isZh ? "退款政策" : "Refund policy"}</Link><Link href="/acceptable-use" className="text-accent-deep underline underline-offset-4">{isZh ? "使用规则" : "Acceptable use"}</Link></p>
            </>
          )}
        </section>
      </main>
      <Footer />
    </>
  );
}

export default function SubscribePage() {
  return <SubscribeContent />;
}
