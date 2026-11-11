"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useTranslations } from "@/i18n/I18nProvider";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
interface Balance { available: number; reserved: number; monthly?: number; permanent?: number; nextExpiry?: string | null; starterEligible?: boolean; starterClaimed?: boolean }
export default function SubscribePage() {
  const { lang } = useTranslations(); const zh = lang === "zh"; const router = useRouter();
  const [user, setUser] = useState<User | null>(null); const [loaded, setLoaded] = useState(false);
  const [checkoutEnabled, setCheckoutEnabled] = useState(false);
  useEffect(() => { let active = true; fetch("/api/billing/config", {cache:"no-store"}).then(r => r.ok ? r.json() : null).then(data => { if(active) setCheckoutEnabled(data?.checkoutEnabled === true); }).catch(() => {}); return () => { active = false; }; }, []);
  const [busy, setBusy] = useState(""); const [error, setError] = useState(""); const [message, setMessage] = useState("");
  const [balance, setBalance] = useState<Balance | null>(null); const requests = useRef<Record<string, string>>({}); const identity = useRef<string | null>(null);
  useEffect(() => {
    let alive = true; let version = 0; let currentAbort: AbortController | null = null;
    if (!isSupabaseConfigured()) { queueMicrotask(() => { if(alive) setLoaded(true); }); return () => { alive = false; }; }
    const supabase = createClient();
    async function load(nextUser: User | null) {
      const sequence = ++version; currentAbort?.abort(); currentAbort = new AbortController(); const signal = currentAbort.signal;
      const current = () => alive && sequence === version;
      if (!current()) return;
      identity.current = nextUser?.id ?? null; setBusy(""); setError(""); setUser(nextUser); setLoaded(true); setBalance(null); setMessage(""); requests.current = {};
      if (!nextUser) return;
      const result = await fetch("/api/billing/credits", { cache: "no-store", signal }).then(r => r.ok ? r.json() : null).catch(() => null);
      if (!current()) return; setBalance(result);
      const params = new URLSearchParams(window.location.search); const requestId = params.get("requestId");
      if (params.get("checkout") !== "return" || !requestId) return;
      setMessage(zh ? "正在核对支付记录，返回页面本身不代表支付成功。" : "Checking payment. Returning here does not by itself confirm payment.");
      for (let i = 0; i < 8 && current(); i++) {
        const res = await fetch(`/api/billing/receipt?requestId=${encodeURIComponent(requestId)}`, { cache: "no-store", signal }).catch(() => null);
        const data = res?.ok ? await res.json() : null;
        if (!current()) return;
        if (data?.paid) {
          setMessage(zh ? "已查到支付记录，当前可用积分以余额为准。" : "Payment recorded. Your current usable credits are shown in the balance below.");
          const b = await fetch("/api/billing/credits", {cache:"no-store",signal}).then(r => r.ok ? r.json() : null).catch(()=>null);
          if(current()) setBalance(b); return;
        }
        await new Promise(r => setTimeout(r, 1500));
      }
      if (current()) setMessage(zh ? "支付尚未确认，请稍后刷新或联系支持；请勿重复付款。" : "Payment is not confirmed yet. Refresh shortly or contact support; please do not pay again.");
    }
    const authGeneration = version;
    supabase.auth.getUser().then(({data}) => { if(alive && version === authGeneration) void load(data.user); });
    const {data: {subscription}} = supabase.auth.onAuthStateChange((_, session) => { void load(session?.user ?? null); });
    return () => { alive = false; version++; currentAbort?.abort(); subscription.unsubscribe(); };
  }, [zh]);
  const action = async (code: string) => {
    if (!user) { router.push("/login?next=/subscribe"); return; }
    const actingUser = user.id;
    if (busy) return; setBusy(code); setError("");
    try {
      if (code === "starter") {
        const res = await fetch("/api/billing/starter", { method: "POST" }); if (!res.ok) throw new Error("starter");
        const b = await fetch("/api/billing/credits", {cache:"no-store"}); if(b.ok) { const data = await b.json(); if(identity.current !== actingUser) return; setBalance(data); }
        setMessage(zh ? "新用户积分已领取。" : "Your starter credits are ready."); setBusy(""); return;
      }
      const requestId = requests.current[code] ||= crypto.randomUUID();
      const res = await fetch(code === "portal" ? "/api/billing/portal" : "/api/billing/checkout", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({productCode:code,requestId})});
      const data = await res.json(); if(!res.ok || !data.url) throw new Error(data.error || "checkout");
      if(identity.current !== actingUser) return;
      window.location.assign(data.url);
    } catch (e) { if(identity.current !== actingUser) return; setBusy(""); const key = e instanceof Error ? e.message : "";
      setError(key === "subscription_already_active" ? (zh ? "你已有有效订阅，请使用管理订阅。" : "You already have a subscription. Use Manage subscription.") : key === "checkout_pending_confirmation" ? (zh ? "结账请求结果尚未确认，请联系下方支持协助核对，不要重复付款。" : "Checkout is awaiting confirmation. Contact support below to reconcile it; do not pay twice.") : key === "no_subscription" ? (zh ? "当前账号暂无 Creem 订阅。" : "This account has no Creem subscription.") : code === "starter" ? (zh ? "暂时无法领取。请确认邮箱已验证且账号符合新用户资格，或稍后重试。" : "Unable to claim. Verify your email and new-account eligibility, or retry later.") : (zh ? "暂时无法打开支付页面，请稍后重试。" : "Checkout is temporarily unavailable. Please retry shortly.")); }
  };
  const plans = [
    {code:"starter", title:zh?"免费体验":"Start exploring", price:"$0", amount:"100", label:zh?"一次性新用户积分":"One-time starter credits", description:zh?"新注册并验证邮箱的账号可领取，无需绑卡，不会自动订阅。":"For newly registered, email-verified accounts. No card. No automatic subscription.", button:balance?.starterClaimed?(zh?"已领取":"Claimed"):user && balance && !balance.starterEligible?(zh?"仅限新账号":"New accounts only"):(zh?"免费领取":"Claim free credits")},
    {code:"generation_monthly", title:zh?"创作月订阅":"Story Creator", price:"$6", amount:"1,000", label:zh?"每月积分":"Credits per billing month", description:zh?"每次成功扣款发放。未用月度积分在该计费周期结束时到期，不结转。":"Granted after each successful payment. Unused monthly credits expire at the end of that billing period, without rollover.", button:zh?"每月 $6 订阅":"Subscribe for $6/month"},
    {code:"credits_500", title:zh?"积分补充包":"Keep the story going", price:"$5", amount:"500", label:zh?"一次性购买积分":"One-time purchased credits", description:zh?"不自动续费，不设到期日；取消订阅不会清空购买积分。":"No recurring charge or expiry. Purchased credits remain when you cancel a subscription.", button:zh?"一次购买 $5":"Buy once for $5"},
  ];
  return <><Navbar creditBalance={balance?.available}/><main className="hallmark-shell flex-grow py-12 md:py-16">
    <header className="max-w-2xl"><p className="hallmark-eyebrow text-muted">{zh?"积分与订阅":"Credits & plans"}</p><h1 className="hallmark-display mt-3 text-4xl">{zh?"让下一个故事继续":"Make room for your next story"}</h1><p className="mt-4 leading-relaxed text-ink-2">{zh?"按需生成故事。提交前会显示具体积分，失败的生成会释放预留积分。":"Generate stories on your terms. Review the exact credit cost before submitting. Failed generations release their reserved credits."}</p></header>
    {user && <section className="mt-7 rounded-xl border border-rule bg-paper p-5"><p>{zh?"可用积分":"Available credits"}: <strong>{balance?.available?.toLocaleString() ?? "—"}</strong>{balance ? ` · ${zh?"处理中预留":"Reserved"} ${balance.reserved}` : ""}</p>{balance && <p className="mt-2 text-sm text-muted">{zh?"月度":"Monthly"}: {balance.monthly ?? 0} · {zh?"非到期积分":"Non-expiring"}: {balance.permanent ?? 0}{balance.nextExpiry ? ` · ${zh?"下次到期":"Next expiry"}: ${new Date(balance.nextExpiry).toLocaleDateString()}`:""}</p>}<button type="button" className="mt-3 underline" disabled={!!busy} onClick={()=>action("portal")}>{zh?"管理订阅 / 取消续费":"Manage subscription / cancel renewal"}</button></section>}
    {message && <p role="status" className="mt-6 rounded-xl border border-rule p-4">{message}</p>}{error && <p role="alert" className="mt-6 rounded-xl bg-error-soft p-4 text-error">{error} <a href="mailto:xiaowangtongxuehhh@gmail.com" className="underline">{zh?"联系支持":"Contact support"}</a></p>}
    <section className="mt-8 grid gap-5 md:grid-cols-3">{plans.map(p=><article key={p.code} className="flex flex-col rounded-card border-[1.5px] border-ink bg-surface-container-lowest p-6"><h2 className="text-xl font-bold">{p.title}</h2><p className="mt-5 text-4xl font-bold">{p.price}<span className="ml-1 text-sm font-normal text-muted">{p.code==="generation_monthly"?(zh?"/ 月":"/ month"):(zh?"一次性":"once")}</span></p><p className="mt-6 text-3xl font-bold">{p.amount}</p><p className="mt-1 text-sm text-muted">{p.label}</p><p className="mt-5 flex-grow text-sm leading-relaxed text-ink-2">{p.description}</p><button type="button" disabled={!!busy || !loaded || (p.code!=="starter" && !checkoutEnabled) || (p.code==="starter" && (!!balance?.starterClaimed || (!!user && !!balance && !balance.starterEligible)))} aria-busy={busy===p.code} onClick={()=>action(p.code)} className="hallmark-btn mt-7 w-full disabled:opacity-50">{busy===p.code?(zh?"处理中…":"Working…"):p.code!=="starter" && !checkoutEnabled?(zh?"支付验证中，暂未开放":"Payments not yet available"):p.button}</button></article>)}</section>
    <div className="mt-8 max-w-3xl space-y-3 text-sm leading-relaxed text-muted"><p>{zh?"价格以美元计。适用税费和最终金额在 Creem 结账时显示。月订阅自动续费，可在客户门户取消下一期续费。":"Prices are in USD. Applicable taxes and the final amount appear at Creem checkout. Monthly plans renew automatically; cancel future renewal in the customer portal."}</p><p>{zh?"以上商品用于故事生成，不包含旧 Founding Reader 的故事库会员权益；已有会员权益不变。免费赠送限符合条件的新账号一次，并受反滥用与服务容量限制。":"These plans fund story generation, not the legacy Founding Reader library membership. Existing membership terms remain unchanged. Free credits are limited to one eligible new account and subject to abuse and capacity safeguards."}</p><p><Link href="/terms" className="underline">{zh?"服务条款":"Terms"}</Link> · <Link href="/refund" className="underline">{zh?"退款政策":"Refund policy"}</Link> · <Link href="/acceptable-use" className="underline">{zh?"使用规则":"Acceptable use"}</Link></p></div>
  </main><Footer/></>;
}
