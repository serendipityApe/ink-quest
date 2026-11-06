"use client";

import Link from "next/link";
import { useTranslations } from "@/i18n/I18nProvider";

export default function StoryPolicyNotice() {
  const { lang } = useTranslations();
  return (
    <p className="mt-4 text-sm leading-relaxed text-ink-2">
      {lang === "zh"
        ? "提示词和生成故事均须遵守使用规则。禁止色情、性露骨、成人及 NSFW 内容。"
        : "Prompts and generated stories must follow our use rules. Pornographic, sexually explicit, adult and NSFW content is prohibited."}
      {" "}<Link href="/acceptable-use" className="font-semibold underline underline-offset-4">{lang === "zh" ? "可接受使用政策" : "Acceptable Use Policy"}</Link>
    </p>
  );
}
