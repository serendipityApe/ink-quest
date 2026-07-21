"use client";

import { useEffect, useState } from "react";
import { Lock, CheckCircle2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

function SubscribeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const checkoutUrl = process.env.NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL;

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }

    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      setLoading(false);
    });
  }, []);

  if (loading) return null;

  if (!user) {
    router.push(`/login?next=/subscribe`);
    return null;
  }

  const handleCheckout = () => {
    const url = checkoutUrl
      ? `${checkoutUrl}?checkout[email]=${encodeURIComponent(user.email ?? "")}`
      : "#";
    window.open(url, "_blank");
  };

  const success = searchParams.get("success");

  return (
    <>
      <Navbar />
      <main className="flex-grow flex flex-col items-center justify-center pt-24 pb-section-gap px-reading-inset max-w-container-max mx-auto w-full relative z-10 min-h-[70vh]">
        <div className="max-w-md w-full flex flex-col items-center text-center p-8 md:p-12 bg-surface/40 rounded-3xl border border-white/20 glass-panel shadow-xl">
          {success ? (
            <div className="flex flex-col items-center animate-in fade-in duration-500">
              <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center text-primary mb-8">
                <CheckCircle2 className="h-8 w-8 text-primary" />
              </div>
              <h1 className="font-story-title-lg text-3xl text-on-surface mb-4">Welcome to the Sect!</h1>
              <p className="font-ui-body text-ui-body text-secondary mb-8 leading-relaxed">
                Your subscription is active. You now have full access to InkQuest.
              </p>
              <button
                onClick={() => router.push("/stories")}
                className="w-full bg-primary text-white font-button-text text-button-text uppercase tracking-widest hover:bg-primary/95 transition-all py-4 px-8 rounded-full flex items-center justify-center cursor-pointer active:scale-98"
              >
                [ Enter the Library ]
              </button>
            </div>
          ) : (
            <>
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-8 animate-bounce">
                <Lock className="h-8 w-8" />
              </div>
              <h1 className="font-story-title-lg text-3xl text-on-surface mb-4">Unlock the Full Adventure</h1>
              <p className="font-ui-body text-ui-body text-secondary mb-8 leading-relaxed">
                Get 10+ new interactive Xianxia &amp; Cyberpunk web novels every single month.
                <br />
                <span className="font-semibold text-on-surface-variant mt-3 block text-2xl">$9.9 / Month</span>
              </p>
              <ul className="text-left font-ui-body text-sm text-on-surface-variant/80 flex flex-col gap-3 mb-8 w-full border-t border-b border-surface-container-high/30 py-6 px-2">
                <li className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-primary shrink-0" /><span>Unlimited access to HSK 1-9 reader archives</span></li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-primary shrink-0" /><span>Audio narration by native Chinese voice actors</span></li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-primary shrink-0" /><span>Advanced hover-dictionary with custom flashcards</span></li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-primary shrink-0" /><span>Interactive grammar explanations per choice</span></li>
              </ul>
              <button
                onClick={handleCheckout}
                className="w-full font-button-text text-button-text text-primary uppercase tracking-widest hover:bg-primary hover:text-white transition-all py-4 px-8 border border-primary/20 rounded-full bg-primary/5 cursor-pointer active:scale-98 flex items-center justify-center gap-2"
              >
                [ Subscribe Now ]
              </button>
              <p className="font-ui-pinyin-sm text-[12px] text-secondary/70 mt-4">Cancel anytime. 7-day money-back guarantee.</p>
            </>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}

export default function SubscribePage() {
  return (
    <Suspense>
      <SubscribeContent />
    </Suspense>
  );
}
