"use client";

import { useEffect, useState } from "react";
import { Lock, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
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

  return (
    <>
      <Navbar />
      <main className="flex-grow flex flex-col items-center justify-center pt-24 pb-section-gap px-reading-inset max-w-container-max mx-auto w-full relative z-10 min-h-[70vh]">
        <div className="max-w-md w-full flex flex-col items-center text-center p-8 md:p-12 bg-surface/40 rounded-3xl border border-white/20 glass-panel shadow-xl">
          {verifiedPremium ? (
            <div className="flex flex-col items-center animate-in fade-in duration-500">
              <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center text-primary mb-8">
                <CheckCircle2 className="h-8 w-8 text-primary" />
              </div>
              <h1 className="font-story-title-lg text-3xl text-on-surface mb-4">{isZh ? "欢迎加入！" : "Welcome to InkQuest!"}</h1>
              <p className="font-ui-body text-ui-body text-secondary mb-8 leading-relaxed">
                {isZh ? "你的订阅已生效，可以使用会员阅读功能。" : "Your subscription is active. Your member reading access is ready."}
              </p>
              <button
                onClick={() => router.push("/stories")}
                className="w-full bg-primary text-white font-button-text text-button-text uppercase tracking-widest hover:bg-primary/95 transition-all py-4 px-8 rounded-full flex items-center justify-center cursor-pointer active:scale-98"
              >
                {isZh ? "进入故事库" : "Enter the library"}
              </button>
            </div>
          ) : (
            <>
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-8 animate-bounce">
                <Lock className="h-8 w-8" />
              </div>
              <h1 className="font-story-title-lg text-3xl text-on-surface mb-4">Founding Reader</h1>
              <p className="font-ui-body text-ui-body text-secondary mb-8 leading-relaxed">
                {isZh ? "继续阅读会员剧情分支，解锁互动故事库的付费阅读内容。" : "Continue premium story branches and unlock paid reading content in the interactive story library."}
                <span className="font-semibold text-on-surface-variant mt-3 block text-xl">{isZh ? "按月订阅" : "Monthly membership"}</span>
              </p>
              <ul className="text-left font-ui-body text-sm text-on-surface-variant/80 flex flex-col gap-3 mb-8 w-full border-t border-b border-surface-container-high/30 py-6 px-2">
                <li className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-primary shrink-0" /><span>{isZh ? "解锁故事库的会员阅读内容" : "Access to premium reading content in the library"}</span></li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-primary shrink-0" /><span>{isZh ? "带配套音频的故事朗读" : "Narration for stories with available audio"}</span></li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-primary shrink-0" /><span>{isZh ? "词义查询与生词收藏" : "Word lookup and saved vocabulary"}</span></li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-primary shrink-0" /><span>{isZh ? "通过选项探索互动剧情" : "Interactive choices to explore the story"}</span></li>
              </ul>
              <button
                onClick={handleCheckout}
                disabled={loading || checkoutLoading}
                aria-busy={checkoutLoading}
                className="w-full font-button-text text-button-text text-primary uppercase tracking-widest hover:bg-primary hover:text-white transition-all py-4 px-8 border border-primary/20 rounded-full bg-primary/5 cursor-pointer active:scale-98 flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? (isZh ? "正在检查登录状态…" : "Checking sign-in…") : checkoutLoading ? (isZh ? "正在打开支付页面…" : "Opening checkout…") : user ? (isZh ? "立即订阅" : "Subscribe now") : (isZh ? "登录后订阅" : "Sign in to subscribe")}
              </button>
              {checkoutError && <p role="alert" className="mt-4 text-sm text-error">{checkoutError}</p>}
              {isCheckoutReturn && !verifiedPremium && (
                <p className="mt-4 text-sm text-secondary">
                  {verifyingPayment ? (isZh ? "正在确认会员状态…" : "Confirming membership…") : (isZh ? "已从支付页面返回，会员状态确认可能需要一点时间。" : "Checkout returned. Membership confirmation may take a moment.")}
                </p>
              )}
              <p className="mt-4 text-sm text-secondary">{isZh ? "故事生成使用积分，提交前会显示所需积分。" : "Story generation uses credits; the required credits are shown before submission."}</p>
              <p className="font-ui-pinyin-sm text-[12px] text-secondary/70 mt-4">{isZh ? "按月自动续订，取消后当前计费周期结束时停止续费。适用税费及最终金额在结账时显示。" : "Renews automatically each month until canceled. Cancellation takes effect at the end of the current billing period. Applicable taxes and the final total are shown at checkout."}</p>
              <p className="mt-4 text-sm"><Link href="/terms" className="underline">{isZh ? "服务条款" : "Terms"}</Link> · <Link href="/refund" className="underline">{isZh ? "退款政策" : "Refund policy"}</Link> · <Link href="/acceptable-use" className="underline">{isZh ? "使用规则" : "Acceptable use"}</Link></p>
            </>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}

export default function SubscribePage() {
  return <SubscribeContent />;
}
