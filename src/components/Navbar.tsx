"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Globe, LogOut, Menu, X } from "lucide-react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { useTranslations } from "@/i18n/I18nProvider";
import type { User } from "@supabase/supabase-js";

interface NavbarProps {
  onSubscribeClick?: () => void;
  variant?: "default" | "reader";
  readerTitle?: string;
  readerLevel?: string;
}

export default function Navbar({ onSubscribeClick, variant = "default", readerTitle, readerLevel }: NavbarProps) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const { t, lang, setLang } = useTranslations();

  useEffect(() => {
    if (variant === "reader") return;
    if (!isSupabaseConfigured()) return;
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user: nextUser } }) => setUser(nextUser));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => setUser(session?.user ?? null));
    return () => subscription.unsubscribe();
  }, [variant]);

  const handleSignOut = async () => {
    if (!isSupabaseConfigured()) return;
    await createClient().auth.signOut();
  };

  if (variant === "reader") {
    return (
      <header className="sticky top-0 z-50 bg-paper">
        <div className="hallmark-shell relative flex min-h-12 items-center justify-between gap-4 md:min-h-14">
          <Link href="/stories" className="inline-flex size-10 items-center justify-center rounded-full border border-ink text-ink transition-colors hover:bg-accent-soft md:size-auto md:min-h-11 md:gap-2 md:rounded-none md:border-0 md:font-semibold md:whitespace-nowrap md:hover:bg-transparent md:hover:text-primary" aria-label={t("reader.backToLibrary")}>
            <ArrowLeft className="size-4" aria-hidden="true" />
            <span className="hidden md:inline">{t("reader.backToLibrary")}</span>
          </Link>
          <div className="absolute left-1/2 min-w-0 max-w-[58%] -translate-x-1/2 text-center md:static md:max-w-[58%] md:translate-x-0 md:text-right">
            <p className="truncate text-sm font-semibold leading-tight">{readerTitle}</p>
            {readerLevel && <p className="mt-0.5 font-outlier text-[10px] leading-tight text-muted">{readerLevel}</p>}
          </div>
        </div>
      </header>
    );
  }

  const membershipAction = onSubscribeClick ? (
    <button type="button" onClick={onSubscribeClick}>{t("nav.pricing")}</button>
  ) : <Link href="/subscribe">{t("nav.pricing")}</Link>;

  return (
    <header className="sticky top-0 z-50 border-b border-rule bg-paper">
      <div className="hallmark-shell grid min-h-[var(--nav-height)] grid-cols-[1fr_auto] items-center gap-4 lg:grid-cols-[1fr_auto_1fr]">
        <Link href="/" className="group inline-flex min-h-11 w-fit items-center gap-3 whitespace-nowrap font-display text-xl font-bold tracking-[-0.045em]">
          <span className="grid size-9 place-items-center rounded-full border-2 border-ink bg-accent font-outlier text-xs shadow-[0_3px_0_var(--color-ink)] transition-transform duration-200 group-hover:-rotate-6" aria-hidden="true">IQ</span>
          <span>InkQuest</span>
        </Link>
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary navigation">
          <Link href="/stories" aria-current={pathname.startsWith("/stories") ? "page" : undefined} className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold whitespace-nowrap aria-[current=page]:bg-accent-soft hover:bg-paper-3">{t("nav.stories")}</Link>
          <Link href="/saved-words" aria-current={pathname === "/saved-words" ? "page" : undefined} className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold whitespace-nowrap aria-[current=page]:bg-accent-soft hover:bg-paper-3">{t("savedWords.title")}</Link>
          <span className="[&>a]:inline-flex [&>a]:min-h-11 [&>a]:items-center [&>a]:rounded-full [&>a]:px-4 [&>a]:text-sm [&>a]:font-semibold [&>a]:whitespace-nowrap [&>a]:hover:bg-paper-3 [&>button]:inline-flex [&>button]:min-h-11 [&>button]:items-center [&>button]:rounded-full [&>button]:px-4 [&>button]:text-sm [&>button]:font-semibold [&>button]:whitespace-nowrap [&>button]:hover:bg-paper-3">{membershipAction}</span>
        </nav>
        <div className="hidden items-center justify-self-end gap-2 lg:flex">
          <button type="button" onClick={() => setLang(lang === "zh" ? "en" : "zh")} className="grid size-11 place-items-center rounded-full border border-rule bg-paper text-xs font-semibold hover:bg-paper-3" aria-label="Switch interface language">{lang === "zh" ? "中" : "EN"}</button>
          {user ? (
            <button type="button" onClick={handleSignOut} className="inline-flex min-h-11 items-center gap-2 px-3 text-sm font-semibold whitespace-nowrap hover:text-primary"><LogOut className="size-4" /> {t("nav.signOut")}</button>
          ) : <Link href="/login" className="inline-flex min-h-11 items-center px-3 text-sm font-semibold whitespace-nowrap hover:text-primary">{t("nav.signIn")}</Link>}
          <Link href="/stories" className="hallmark-btn">{lang === "zh" ? "开始阅读" : "Start reading"}<span aria-hidden="true">→</span></Link>
        </div>
        <button type="button" onClick={() => setIsOpen((open) => !open)} className="grid size-11 place-items-center justify-self-end rounded-full border-2 border-ink bg-paper lg:hidden" aria-expanded={isOpen} aria-controls="mobile-navigation" aria-label={isOpen ? "Close menu" : "Open menu"}>{isOpen ? <X className="size-5" /> : <Menu className="size-5" />}</button>
      </div>
      {isOpen && (
        <nav id="mobile-navigation" className="border-b-[3px] border-ink bg-paper px-[var(--page-gutter)] pb-6 lg:hidden" aria-label="Mobile navigation">
          <div className="flex flex-col">
            <Link href="/stories" onClick={() => setIsOpen(false)} className="flex min-h-12 items-center border-b border-rule font-semibold whitespace-nowrap">{t("nav.stories")}</Link>
            <Link href="/saved-words" onClick={() => setIsOpen(false)} className="flex min-h-12 items-center border-b border-rule font-semibold whitespace-nowrap">{t("savedWords.title")}</Link>
            <span className="[&>a]:flex [&>a]:min-h-12 [&>a]:items-center [&>a]:border-b [&>a]:border-rule [&>a]:font-semibold [&>a]:whitespace-nowrap [&>button]:flex [&>button]:min-h-12 [&>button]:w-full [&>button]:items-center [&>button]:border-b [&>button]:border-rule [&>button]:font-semibold [&>button]:whitespace-nowrap">{membershipAction}</span>
            <button type="button" onClick={() => setLang(lang === "zh" ? "en" : "zh")} className="flex min-h-12 items-center gap-2 border-b border-rule font-semibold whitespace-nowrap"><Globe className="size-4" /> {lang === "zh" ? t("lang.en") : t("lang.zh")}</button>
            {user ? <button type="button" onClick={handleSignOut} className="mt-4 inline-flex min-h-12 items-center justify-center gap-2 rounded-full border-2 border-ink font-semibold whitespace-nowrap"><LogOut className="size-4" />{t("nav.signOut")}</button> : <Link href="/login" className="hallmark-btn mt-4">{t("nav.signIn")}</Link>}
          </div>
        </nav>
      )}
    </header>
  );
}
