"use client";

import { useState } from "react";
import { Lock, CheckCircle2 } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function SubscribePage() {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubscribe = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setSuccess(true);
      // Update local storage to show user as premium
      localStorage.setItem("cm_is_premium", "true");
    }, 1500);
  };

  return (
    <>
      <Navbar />

      <main className="flex-grow flex flex-col items-center justify-center pt-24 pb-section-gap px-reading-inset max-w-container-max mx-auto w-full relative z-10 min-h-[70vh]">
        <div className="max-w-md w-full flex flex-col items-center text-center p-8 md:p-12 bg-surface/40 rounded-3xl border border-white/20 glass-panel shadow-xl">
          
          {!success ? (
            <>
              {/* Lock Icon */}
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-8 animate-bounce">
                <Lock className="h-8 w-8" />
              </div>
              
              <h1 className="font-story-title-lg text-3xl text-on-surface mb-4">
                Unlock the Full Adventure
              </h1>
              
              <p className="font-ui-body text-ui-body text-secondary mb-8 leading-relaxed">
                Get 10+ new interactive Xianxia &amp; Cyberpunk web novels every single month.
                <br />
                <span className="font-semibold text-on-surface-variant mt-3 block text-2xl">
                  $9.9 / Month
                </span>
              </p>

              <ul className="text-left font-ui-body text-sm text-on-surface-variant/80 flex flex-col gap-3 mb-8 w-full border-t border-b border-surface-container-high/30 py-6 px-2">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  <span>Unlimited access to HSK 1-6 reader archives</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  <span>Audio narration by native Chinese voice actors</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  <span>Advanced hover-dictionary with custom flashcards</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  <span>Interactive grammar explanations per choice</span>
                </li>
              </ul>
              
              <button 
                onClick={handleSubscribe}
                disabled={loading}
                className="w-full font-button-text text-button-text text-primary uppercase tracking-widest hover:bg-primary hover:text-white transition-all py-4 px-8 border border-primary/20 rounded-full bg-primary/5 cursor-pointer active:scale-98 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <span className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                    Processing...
                  </>
                ) : (
                  "[ Subscribe Now ]"
                )}
              </button>
            </>
          ) : (
            <div className="flex flex-col items-center animate-in fade-in duration-500">
              {/* Success Icon */}
              <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center text-primary mb-8">
                <CheckCircle2 className="h-8 w-8 text-primary" />
              </div>
              
              <h1 className="font-story-title-lg text-3xl text-on-surface mb-4">
                Thank you!
              </h1>
              
              <p className="font-ui-body text-ui-body text-secondary mb-8 leading-relaxed">
                Your subscription has been activated successfully. You now have full access to CyberMandarin.
              </p>
              
              <button 
                onClick={() => { window.location.href = "/stories"; }}
                className="w-full bg-primary text-white font-button-text text-button-text uppercase tracking-widest hover:bg-primary/95 transition-all py-4 px-8 rounded-full flex items-center justify-center cursor-pointer active:scale-98"
              >
                [ Go to Library ]
              </button>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </>
  );
}
