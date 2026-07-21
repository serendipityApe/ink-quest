"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (!isSupabaseConfigured()) {
      setLoading(false);
      setError("Authentication is not configured yet.");
      return;
    }

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setSent(true);
  };

  const handleGoogleLogin = async () => {
    if (!isSupabaseConfigured()) {
      setError("Authentication is not configured yet.");
      return;
    }

    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
  };

  return (
    <>
      <Navbar />
      <main className="flex-grow flex items-center justify-center pt-24 pb-section-gap px-reading-inset min-h-[70vh]">
        <div className="w-full max-w-sm flex flex-col gap-6 p-8 bg-surface/40 rounded-3xl border border-white/20 glass-panel shadow-xl">
          <h1 className="font-story-title-lg text-2xl text-on-surface text-center">Sign in to InkQuest</h1>

          {sent ? (
            <p className="font-ui-body text-sm text-secondary text-center leading-relaxed">
              Check your email — we sent a magic link to <span className="text-primary font-medium">{email}</span>.
            </p>
          ) : (
            <>
              <button
                onClick={handleGoogleLogin}
                className="w-full flex items-center justify-center gap-3 py-3 px-4 border border-surface-container-high/40 rounded-full font-button-text text-sm text-on-surface hover:bg-surface-container-low transition-colors cursor-pointer"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
              </button>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-surface-container-high/40" />
                <span className="font-ui-pinyin-sm text-xs text-secondary">or</span>
                <div className="flex-1 h-px bg-surface-container-high/40" />
              </div>

              <form onSubmit={handleEmailLogin} className="flex flex-col gap-3">
                <input
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full bg-surface-container-low border border-surface-container-high/40 focus:border-primary focus:outline-none rounded-lg px-4 py-2.5 font-ui-body text-sm placeholder:text-on-surface-variant/40 transition-colors"
                />
                {error && <p className="text-xs text-error">{error}</p>}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 px-4 bg-primary text-white font-button-text text-sm uppercase tracking-widest rounded-full hover:bg-primary/90 transition-colors cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {loading && <span className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />}
                  Send Magic Link
                </button>
              </form>
            </>
          )}

          <button
            onClick={() => router.back()}
            className="font-ui-pinyin-sm text-xs text-secondary hover:text-on-surface transition-colors text-center"
          >
            ← Back
          </button>
        </div>
      </main>
      <Footer />
    </>
  );
}
