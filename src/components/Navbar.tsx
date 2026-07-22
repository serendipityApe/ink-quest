"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { Menu, X, LogOut, Globe } from "lucide-react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { useTranslations } from "@/i18n/I18nProvider";
import type { User } from "@supabase/supabase-js";

interface NavbarProps {
  onSubscribeClick?: () => void;
}

export default function Navbar({ onSubscribeClick }: NavbarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const { t, lang, setLang } = useTranslations();

  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    if (!isSupabaseConfigured()) return;

    const supabase = createClient();
    await supabase.auth.signOut();
  };

  const navLink = "text-on-surface-variant font-ui-label-lg text-ui-label-lg hover:text-primary transition-colors duration-300 cursor-pointer";

  return (
    <nav className="bg-surface/80 backdrop-blur-xl w-full top-0 sticky z-50 border-b border-surface-container-high/20 transition-all duration-300">
      <div className="flex justify-between items-center w-full px-5 md:px-reading-inset py-base max-w-container-max mx-auto h-16">
        <Link href="/" className="font-story-title-lg text-[24px] text-primary tracking-tighter decoration-none hover:opacity-80 transition-opacity">
          <div className="flex items-center gap-2">
            <span className="font-bold">IQ</span>
            <span className="text-[20px] md:text-[24px]">InkQuest</span>
          </div>
        </Link>

        <ul className="hidden md:flex items-center gap-8">
          <li><Link href="/stories" className={navLink}>{t("nav.stories")}</Link></li>
          <li>
            <button onClick={onSubscribeClick} className={`${navLink} text-left`}>
              {t("nav.pricing")}
            </button>
          </li>
        </ul>

        <div className="hidden md:flex items-center gap-4">
          {/* 界面语言切换（与学习语言无关） */}
          <button
            onClick={() => setLang(lang === "zh" ? "en" : "zh")}
            className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-full border border-[rgba(0,3,17,0.05)] bg-transparent text-on-surface font-button-text text-[13px] leading-none transition-colors hover:border-[rgba(0,3,17,0.08)] cursor-pointer"
            aria-label="Switch interface language"
          >
            {lang === "zh" ? "中" : "EN"}
          </button>
          {user ? (
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1.5 font-button-text text-button-text text-xs uppercase tracking-widest text-secondary hover:text-primary transition-colors cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              {t("nav.signOut")}
            </button>
          ) : (
            <Link
              href="/login"
              className="inline-flex h-[30px] items-center leading-[30px] font-button-text text-button-text uppercase tracking-widest text-primary border-b border-transparent hover:border-primary transition-all duration-300 cursor-pointer"
            >
              {t("nav.signIn")}
            </Link>
          )}
        </div>

        <button
          onClick={() => setIsOpen(!isOpen)}
          className="md:hidden text-primary focus:outline-none flex items-center p-1"
          aria-label="Toggle menu"
        >
          {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {isOpen && (
        <div className="md:hidden w-full bg-surface/95 backdrop-blur-xl border-b border-surface-container-high/40 px-5 py-6 flex flex-col gap-6 animate-in fade-in slide-in-from-top-4 duration-200">
          <ul className="flex flex-col gap-4">
            <li><Link href="/stories" onClick={() => setIsOpen(false)} className="block text-on-surface-variant font-ui-label-lg text-ui-label-lg hover:text-primary py-2 border-b border-surface-container/50">{t("nav.stories")}</Link></li>
            <li>
              <button onClick={() => { setIsOpen(false); onSubscribeClick?.(); }} className="block w-full text-left text-on-surface-variant font-ui-label-lg text-ui-label-lg hover:text-primary py-2 border-b border-surface-container/50">
                {t("nav.pricing")}
              </button>
            </li>
            <li>
              <button onClick={() => setLang(lang === "zh" ? "en" : "zh")} className="flex items-center gap-2 w-full text-left text-on-surface-variant font-ui-label-lg text-ui-label-lg hover:text-primary py-2 border-b border-surface-container/50">
                <Globe className="h-4 w-4" />
                {lang === "zh" ? t("lang.en") : t("lang.zh")}
              </button>
            </li>
          </ul>
          <div>
            {user ? (
              <button
                onClick={() => { setIsOpen(false); handleSignOut(); }}
                className="w-full text-center py-3 rounded-lg font-button-text text-button-text uppercase tracking-widest text-secondary border border-surface-container-high/40 hover:text-primary transition-colors"
              >
                {t("nav.signOut")}
              </button>
            ) : (
              <Link
                href="/login"
                onClick={() => setIsOpen(false)}
                className="inline-block w-full text-center bg-primary-container text-on-primary-container py-3 rounded-lg font-button-text text-button-text uppercase tracking-widest hover:bg-surface-tint hover:text-on-primary transition-colors duration-300"
              >
                {t("nav.signIn")}
              </Link>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
