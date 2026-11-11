"use client";

import { useTranslations } from "@/i18n/I18nProvider";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { sanitizeRedirectPath } from "@/lib/auth/redirect";

export default function LoginPage() {
  const router = useRouter();
  const { lang } = useTranslations();
  const isZh = lang === "zh";
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const getCallbackUrl = () => {
    const next = sanitizeRedirectPath(new URLSearchParams(location.search).get("next"));
    return `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (!isSupabaseConfigured()) {
      setLoading(false);
      setError(isZh ? "登录服务暂不可用，请稍后重试。" : "Sign-in is unavailable. Please try again later.");
      return;
    }

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: getCallbackUrl() },
    });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setSent(true);
  };

  const handleGoogleLogin = async () => {
    if (!isSupabaseConfigured()) {
      setError(isZh ? "登录服务暂不可用，请稍后重试。" : "Sign-in is unavailable. Please try again later.");
      return;
    }

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: getCallbackUrl() },
    });
    if (error) setError(error.message);
  };

  return (
    <>
      <Navbar />
      <main className="flex-grow flex items-center justify-center py-16 px-4 min-h-[70vh]">
        <div className="w-full max-w-md flex flex-col gap-6 p-8 bg-surface-container-lowest rounded-card border-[1.5px] border-ink">
          <h1 className="font-display font-bold text-3xl text-on-surface text-center">{isZh ? "登录 InkQuest" : "Sign in to InkQuest"}</h1>

          {sent ? (
            <p className="font-ui-body text-sm text-secondary text-center leading-relaxed">
              {isZh ? "登录链接已发送，请检查邮箱：" : "Check your email — we sent a sign-in link to "}<span className="text-primary font-medium">{email}</span>.
            </p>
          ) : (
            <>
              <button
                onClick={handleGoogleLogin}
                className="iq-secondary w-full"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                {isZh ? "使用 Google 继续" : "Continue with Google"}
              </button>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-surface-container-high/40" />
                <span className="font-ui-pinyin-sm text-xs text-secondary">{isZh ? "或使用邮箱" : "or use email"}</span>
                <div className="flex-1 h-px bg-surface-container-high/40" />
              </div>

              <form onSubmit={handleEmailLogin} className="flex flex-col gap-3">
                <label htmlFor="login-email" className="text-sm font-semibold">{isZh ? "邮箱地址" : "Email address"}</label>
                <input
                  id="login-email"
                  autoComplete="email"
                  aria-describedby="email-hint"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="min-h-12 w-full bg-surface-container-lowest border border-rule rounded-input px-4 text-sm"
                />
                {error && <p role="alert" className="text-sm text-error">{error}</p>}
                <button
                  type="submit"
                  disabled={loading}
                  className="hallmark-btn w-full"
                >
                  {loading && <span className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />}
                  {loading ? (isZh ? "正在发送…" : "Sending…") : (isZh ? "发送登录链接" : "Send sign-in link")}
                </button>
                <p id="email-hint" className="text-sm leading-relaxed text-muted">{isZh ? "我们会把一次性登录链接发送到这个邮箱。" : "We’ll email you a one-time sign-in link."}</p>
              </form>
            </>
          )}

          <button
            onClick={() => router.back()}
            className="font-ui-pinyin-sm text-xs text-secondary hover:text-on-surface transition-colors text-center"
          >
            ← {isZh ? "返回" : "Back"}
          </button>
        </div>
      </main>
      <Footer />
    </>
  );
}
