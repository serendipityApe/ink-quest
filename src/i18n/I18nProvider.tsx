"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { Lang } from "@/types/story";
import { translate, type TranslationKey } from "@/i18n/dictionaries";

/**
 * 界面语言上下文。语言偏好存 cookie（SSR 可读）+ localStorage（客户端快速读）。
 * 与「学习目标语言」无关：切界面语言不影响在读的故事。
 */

const LANG_COOKIE = "cm_ui_lang";
const LANG_KEY = "cm_ui_lang";

interface I18nValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: TranslationKey) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

function readInitialLang(): Lang {
  if (typeof document === "undefined") return "en";
  // 优先 localStorage，其次 cookie，最后按浏览器语言猜测
  const stored = localStorage.getItem(LANG_KEY);
  if (stored === "zh" || stored === "en") return stored;
  const m = document.cookie.match(/(?:^|;\s*)cm_ui_lang=(zh|en)/);
  if (m) return m[1] as Lang;
  return navigator.language?.toLowerCase().startsWith("zh") ? "zh" : "en";
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  // 挂载后从存储恢复（避免 SSR/CSR 文案不一致：初始统一 en，挂载后再切）
  useEffect(() => {
    setLangState(readInitialLang());
  }, []);

  // 同步 <html lang>，便于无障碍/SEO
  useEffect(() => {
    if (typeof document !== "undefined") document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    if (typeof window !== "undefined") {
      localStorage.setItem(LANG_KEY, l);
      // 一年期 cookie，供 SSR 读取默认值
      document.cookie = `${LANG_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
    }
  }, []);

  const t = useCallback((key: TranslationKey) => translate(lang, key), [lang]);

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslations(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useTranslations must be used within I18nProvider");
  return ctx;
}
