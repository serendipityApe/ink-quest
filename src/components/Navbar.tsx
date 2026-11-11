"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Coins, Globe, LogOut, Menu, UserRound, X } from "lucide-react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { useTranslations } from "@/i18n/I18nProvider";
import { DEFAULT_STORY_HREF, WITHDRAWN_STORY_IDS } from "@/lib/stories/entry-points";
import type { User } from "@supabase/supabase-js";

interface NavbarProps {
  onSubscribeClick?: () => void;
  variant?: "default" | "reader";
  readerTitle?: string;
  readerLevel?: string;
  readerActions?: ReactNode;
  creditBalance?: number | null;
}

export default function Navbar({ onSubscribeClick, variant = "default", readerTitle, readerLevel, readerActions, creditBalance }: NavbarProps) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [resumeStoryId, setResumeStoryId] = useState<string | null>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const { t, lang, setLang } = useTranslations();
  const isZh = lang === "zh";

  useEffect(() => {
    if (variant === "reader" || !isSupabaseConfigured()) return;
    let alive = true;
    let balanceSequence = 0;
    const supabase = createClient();
    const update = (nextUser: User | null) => {
      if (!alive) return;
      const sequence = ++balanceSequence;
      setUser(nextUser);
      setCredits(null);
      if (nextUser) fetch("/api/billing/status", { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(data => {
        if (alive && sequence === balanceSequence) setCredits(data?.credits?.available ?? null);
      }).catch(() => {});
    };
    supabase.auth.getUser().then(({ data }) => update(data.user)).catch(() => update(null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => update(session?.user ?? null));
    return () => { alive = false; subscription.unsubscribe(); };
  }, [variant]);

  useEffect(() => {
    if (variant === "reader") return;
    const frame = requestAnimationFrame(() => {
      const key = Object.keys(localStorage).find(key => key.startsWith("cm_pos_") && !WITHDRAWN_STORY_IDS.has(key.slice(7)) && localStorage.getItem(key));
      setResumeStoryId(key?.slice(7) ?? null);
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname, variant]);

  useEffect(() => {
    if (!isOpen && !accountOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setIsOpen(false); setAccountOpen(false); (isOpen ? menuButton.current : accountRef.current?.querySelector("button"))?.focus(); }
    };
    const outside = (event: PointerEvent) => {
      if (!accountRef.current?.contains(event.target as Node)) setAccountOpen(false);
    };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", outside);
    const previous = document.body.style.overflow;
    if (isOpen) document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", close); document.removeEventListener("pointerdown", outside); document.body.style.overflow = previous; };
  }, [isOpen, accountOpen]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => { setIsOpen(false); setAccountOpen(false); });
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeMobileMenu = () => { if (desktop.matches) setIsOpen(false); };
    desktop.addEventListener("change", closeMobileMenu);
    return () => desktop.removeEventListener("change", closeMobileMenu);
  }, []);

  const signOut = async () => { await createClient().auth.signOut(); setIsOpen(false); setAccountOpen(false); };
  const membership = () => { setIsOpen(false); setAccountOpen(false); onSubscribeClick?.(); };
  const navItems = [
    { href: "/stories", label: t("nav.stories") },
    { href: "/generate", label: t("nav.create") },
    ...(user ? [{ href: "/my-stories", label: isZh ? "我的故事" : "My stories" }] : []),
    { href: "/saved-words", label: t("savedWords.title") },
  ];
  const displayedCredits = creditBalance === undefined ? credits : creditBalance;
  const resumeHref = resumeStoryId ? `/stories/${resumeStoryId}` : DEFAULT_STORY_HREF;

  if (variant === "reader") return <header className="sticky top-0 z-40 border-b border-rule bg-paper">
    <div className="hallmark-shell grid min-h-16 grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-2 md:grid-cols-[1fr_auto_1fr]">
      <Link prefetch={false} href="/stories" className="iq-quiet justify-self-start" aria-label={t("reader.backToLibrary")}><ArrowLeft className="size-4" /><span className="hidden md:inline">{isZh ? "故事库" : "Library"}</span></Link>
      <div className="min-w-0 text-center md:flex md:max-w-md md:items-center md:gap-3"><p className="truncate text-sm font-bold">{readerTitle}</p>{readerLevel && <span className="text-xs text-muted md:iq-badge">{readerLevel}</span>}</div>
      <div className="hidden items-center justify-self-end gap-2 md:flex">{readerActions}</div>
    </div>
  </header>;

  return <header className="sticky top-0 z-50 border-b border-rule bg-paper">
    <div className="hallmark-shell flex min-h-[var(--nav-height)] items-center justify-between gap-3">
      <Link prefetch={false} href="/" className="inline-flex shrink-0 items-center gap-2.5 font-display text-[22px] font-bold tracking-tight"><span className="grid size-9 place-items-center rounded-full border-2 border-ink bg-accent font-outlier text-xs" aria-hidden="true">IQ</span>InkQuest</Link>
      <nav className="mx-auto hidden items-center gap-1 lg:flex" aria-label={isZh ? "主导航" : "Primary navigation"}>{navItems.map(item => <Link prefetch={false} key={item.href} href={item.href} aria-current={pathname.startsWith(item.href) ? "page" : undefined} className="iq-nav-link">{item.label}</Link>)}</nav>
      <div className="hidden items-center gap-1 lg:flex">
        <button type="button" onClick={() => setLang(isZh ? "en" : "zh")} className="iq-quiet" aria-label={isZh ? "切换为英文界面" : "Switch interface to Chinese"}><Globe className="size-4" />{isZh ? "EN" : "中文"}</button>
        {user ? <>
          <Link prefetch={false} href="/subscribe" className="iq-quiet" aria-label={`${displayedCredits ?? "—"} ${isZh ? "积分" : "credits"}`}><Coins className="size-4" /><span className="tabular-nums">{displayedCredits?.toLocaleString() ?? "—"}</span></Link>
          <div ref={accountRef} className="relative"><button type="button" className="iq-quiet" aria-label={isZh ? "账户菜单" : "Account menu"} aria-expanded={accountOpen} aria-controls="account-menu" onClick={() => setAccountOpen(!accountOpen)}><UserRound className="size-5" /></button>
            {accountOpen && <div id="account-menu" className="absolute right-0 top-full mt-2 min-w-44 rounded-xl border border-rule bg-surface-container-lowest p-2 shadow-soft">
              {onSubscribeClick ? <button type="button" className="iq-quiet w-full justify-start" onClick={membership}>{t("nav.pricing")}</button> : <Link prefetch={false} href="/subscribe" onClick={membership} className="iq-quiet w-full justify-start">{t("nav.pricing")}</Link>}
              <button type="button" onClick={signOut} className="iq-quiet w-full justify-start"><LogOut className="size-4" />{t("nav.signOut")}</button>
            </div>}
          </div>
        </> : <><Link prefetch={false} href="/subscribe" className="iq-quiet">{t("nav.pricing")}</Link><Link prefetch={false} href="/login" className="iq-quiet">{t("nav.signIn")}</Link></>}
        <Link prefetch={false} href={resumeHref} className="hallmark-btn ml-2">{resumeStoryId ? (isZh ? "继续阅读" : "Continue reading") : (isZh ? "免费试读" : "Read free")}<span aria-hidden="true">→</span></Link>
      </div>
      <div className="flex items-center gap-1 lg:hidden"><Link prefetch={false} href={resumeHref} className="iq-quiet text-sm">{resumeStoryId ? (isZh ? "继续" : "Continue") : (isZh ? "试读" : "Read free")}</Link><button ref={menuButton} type="button" onClick={() => setIsOpen(!isOpen)} className="iq-quiet" aria-expanded={isOpen} aria-controls="mobile-navigation" aria-label={isOpen ? (isZh ? "关闭菜单" : "Close menu") : (isZh ? "打开菜单" : "Open menu")}>{isOpen ? <X className="size-5" /> : <Menu className="size-5" />}</button></div>
    </div>
    {isOpen && <nav id="mobile-navigation" className="fixed inset-x-0 bottom-0 top-[var(--nav-height)] overflow-y-auto bg-paper px-6 py-4 lg:hidden" aria-label={isZh ? "移动导航" : "Mobile navigation"}>
      <div className="grid gap-1 border-b border-rule pb-5">{navItems.map(item => <Link prefetch={false} key={item.href} href={item.href} onClick={() => setIsOpen(false)} aria-current={pathname.startsWith(item.href) ? "page" : undefined} className="iq-nav-link min-h-14 text-lg">{item.label}</Link>)}</div>
      <p className="mt-6 text-xs text-muted">{isZh ? "账户" : "Account"}</p><Link prefetch={false} href="/subscribe" onClick={() => setIsOpen(false)} className="flex min-h-14 items-center justify-between font-semibold"><span>{t("nav.pricing")}</span>{user && <span className="flex items-center gap-2 text-sm"><Coins className="size-4" />{displayedCredits?.toLocaleString() ?? "—"} {isZh ? "积分" : "credits"}</span>}</Link>
      <div className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-y border-rule"><span className="text-sm">{isZh ? "界面语言" : "Interface language"}</span><div className="iq-segment"><button type="button" className="iq-quiet" aria-pressed={isZh} onClick={() => setLang("zh")}>中文</button><button type="button" className="iq-quiet" aria-pressed={!isZh} onClick={() => setLang("en")}>EN</button></div></div>
      {user ? <button type="button" onClick={signOut} className="iq-quiet mt-4"><LogOut className="size-4" />{t("nav.signOut")}</button> : <Link prefetch={false} href="/login" onClick={() => setIsOpen(false)} className="hallmark-btn mt-6">{t("nav.signIn")}</Link>}
      <div className="mt-10 flex flex-wrap gap-4 text-sm text-muted">{[["/terms",isZh ? "服务条款" : "Terms"],["/privacy",isZh ? "隐私政策" : "Privacy"],["/refund",isZh ? "退款政策" : "Refunds"]].map(([href,label]) => <Link prefetch={false} key={href} href={href} onClick={() => setIsOpen(false)} className="inline-flex min-h-11 items-center">{label}</Link>)}</div>
    </nav>}
  </header>;
}
