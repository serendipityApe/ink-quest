"use client";

import { useEffect } from "react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { sanitizeRedirectPath } from "@/lib/auth/redirect";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: { client_id: string; nonce: string; callback: (response: { credential: string }) => void }) => void;
          prompt: () => void;
          cancel: () => void;
        };
      };
    };
  }
}

const GOOGLE_SCRIPT_SRC = "https://accounts.google.com/gsi/client";

function createNonce() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hashNonce(nonce: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(nonce));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export default function GoogleOneTap() {
  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId || !isSupabaseConfigured()) return;

    let cancelled = false;
    const supabase = createClient();
    const nonce = createNonce();

    const redirectAfterLogin = () => {
      if (window.location.pathname === "/login") {
        return sanitizeRedirectPath(new URLSearchParams(window.location.search).get("next"));
      }
      return `${window.location.pathname}${window.location.search}${window.location.hash}`;
    };

    const handleCredential = async ({ credential }: { credential: string }) => {
      const { error } = await supabase.auth.signInWithIdToken({
        provider: "google",
        token: credential,
        nonce,
      });
      if (!error && !cancelled) {
        window.location.assign(redirectAfterLogin());
      }
    };

    const initialize = async () => {
      if (cancelled || !window.google) return;
      const hashedNonce = await hashNonce(nonce);
      if (cancelled || !window.google) return;
      window.google.accounts.id.initialize({ client_id: clientId, nonce: hashedNonce, callback: handleCredential });
      window.google.accounts.id.prompt();
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session || cancelled) return;

      if (window.google) {
        initialize();
        return;
      }

      const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${GOOGLE_SCRIPT_SRC}"]`);
      const script = existingScript ?? document.createElement("script");
      if (!existingScript) {
        script.src = GOOGLE_SCRIPT_SRC;
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      }
      script.addEventListener("load", initialize, { once: true });
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") window.google?.accounts.id.cancel();
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      window.google?.accounts.id.cancel();
    };
  }, []);

  return null;
}
