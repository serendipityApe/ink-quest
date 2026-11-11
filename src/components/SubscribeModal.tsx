"use client";

import { useEffect } from "react";
import { Lock, X } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "@/i18n/I18nProvider";

interface SubscribeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SubscribeModal({ isOpen, onClose }: SubscribeModalProps) {
  const { lang } = useTranslations();
  const isZh = lang === "zh";

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);


    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", handleKeyDown); };
  }, [isOpen, onClose]);

  if (!isOpen) return null;


  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-ink/45" onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-labelledby="subscribe-modal-title" className="relative z-10 flex max-h-[90dvh] w-full max-w-md flex-col items-center overflow-y-auto rounded-card border border-rule bg-surface-container-lowest p-8 text-center shadow-soft md:p-12">
        <button onClick={onClose} className="absolute right-4 top-4 grid size-11 place-items-center rounded-full border border-ink hover:bg-paper-3" aria-label={isZh ? "关闭" : "Close modal"}>
          <X className="h-5 w-5" />
        </button>

        <div className="mb-6 grid size-16 place-items-center rounded-full border-[1.5px] border-ink bg-accent-soft">
          <Lock className="h-8 w-8" />
        </div>
        <p className="font-outlier text-xs uppercase tracking-[0.08em] text-muted">Founding Reader</p>
        <h2 id="subscribe-modal-title" className="hallmark-display mb-4 mt-3 text-3xl">{isZh ? "继续这条支线。" : "Continue this branch."}</h2>
        <p className="mb-8 font-body leading-relaxed text-ink-2">
          {isZh ? "这是独立的旧故事库会员，不包含生成积分。已有会员请登录原账号。" : "This legacy library membership is separate from generation-credit plans. Existing members should sign in with their original account."}

        </p>
        <p className="text-sm text-muted">{isZh ? "旧会员的新购入口暂未确认可用。请勿购买生成积分来解锁此会员分支。已有会员如无法访问，请联系我们。" : "New purchases of this legacy membership are not currently confirmed available. Generation credits do not unlock this member branch. Existing members with access issues can contact us."}</p>
        <a href="mailto:xiaowangtongxuehhh@gmail.com" className="hallmark-btn mt-5 w-full">{isZh ? "联系会员支持" : "Contact membership support"}</a>
        <Link href="/subscribe" onClick={onClose} className="mt-4 text-sm underline">{isZh ? "查看独立的生成积分套餐" : "View separate generation-credit plans"}</Link>
      </div>
    </div>
  );
}
