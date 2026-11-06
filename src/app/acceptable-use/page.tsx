import type { Metadata } from "next";
import Link from "next/link";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Acceptable Use Policy · 可接受使用政策",
  description: "Rules for InkQuest prompts and generated stories. Pornographic, sexually explicit, adult and NSFW story generation is prohibited.",
  alternates: { canonical: "/acceptable-use" },
};

export default function AcceptableUsePage() {
  return (
    <LegalPage eyebrow="Safety · 使用规则" title="Acceptable Use Policy / 可接受使用政策"
      summary="Rules for user prompts and generated stories / 用户提示词与生成故事的使用规则"
      effectiveDate="November 6, 2026 / 2026年11月6日">
      <nav aria-label="Policy language"><a href="#english">English</a> · <a href="#chinese">中文</a></nav>
      <div id="english" lang="en">
        <section>
          <h2>1. Scope</h2>
          <p>InkQuest is for language learning through interactive fiction. This policy applies to all prompts, story ideas, names, outlines, selections and other inputs you submit, and to stories and other content generated, continued, used or shared through InkQuest. It supplements our <Link href="/terms">Terms of Service</Link>.</p>
        </section>
        <section>
          <h2>2. Prohibited content and uses</h2>
          <ul>
            <li><strong>No pornography, sexually explicit content, adult content or NSFW story generation.</strong> Do not request, generate, continue or share erotic stories, explicit sexual descriptions, sexual roleplay or content intended for sexual arousal. This prohibition applies even to fictional characters and consenting adults.</li>
            <li>No sexual content involving minors, sexual exploitation, non-consensual sexual content, or sexualized depictions of real people.</li>
            <li>No content promoting hatred, targeted harassment, threats, violent extremism or abuse. Do not generate graphic violence for shock or gratification, or encourage self-harm.</li>
            <li>No instructions that facilitate crimes, violence, fraud, malware, exploitation or other harmful or illegal activity.</li>
            <li>No infringement of copyright or other rights, impersonation for deception, or disclosure of another person’s private or confidential information without permission.</li>
            <li>No attempts to evade these rules, bypass safeguards or access controls, or disrupt or abuse the service.</li>
          </ul>
        </section>
        <section>
          <h2>3. Your responsibilities and reporting</h2>
          <p>Use only inputs you are entitled to provide. Review generated stories before using or sharing them: AI output may be inaccurate or inappropriate. Unexpected output does not grant permission to continue or distribute prohibited content. Stop using the affected content and report it to <a href="mailto:xiaowangtongxuehhh@gmail.com">xiaowangtongxuehhh@gmail.com</a>, with the story link and a brief description; do not send sensitive material unnecessarily.</p>
          <p>We may remove or restrict content and suspend access for violations of this policy. We do not guarantee that every input or output is reviewed or that all prohibited content will be detected.</p>
        </section>
      </div>
      <div id="chinese" lang="zh-CN">
        <section>
          <h2>1. 适用范围</h2>
          <p>InkQuest 用于通过互动小说学习语言。本政策适用于你提交的所有提示词、故事创意、姓名、大纲、选项及其他输入，也适用于通过 InkQuest 生成、续写、使用或分享的故事及其他内容。本政策是<Link href="/terms">服务条款</Link>的补充。</p>
        </section>
        <section>
          <h2>2. 禁止的内容与用途</h2>
          <ul>
            <li><strong>禁止色情、性露骨内容、成人内容及 NSFW 故事生成。</strong>不得请求、生成、续写或分享色情故事、露骨性描写、性角色扮演或以性唤起为目的的内容。即使涉及虚构人物或自愿的成年人，同样禁止。</li>
            <li>禁止涉及未成年人的性内容、性剥削、非自愿性内容，以及对真实人物的性化描写。</li>
            <li>禁止宣扬仇恨、定向骚扰、威胁、暴力极端主义或虐待。不得为了猎奇或满足感生成血腥暴力内容，也不得鼓励自伤。</li>
            <li>禁止提供协助犯罪、暴力、欺诈、恶意软件、剥削或其他有害、违法活动的操作指导。</li>
            <li>禁止侵犯版权及其他权利、以欺骗为目的冒充他人，或未经许可披露他人的私人信息或保密资料。</li>
            <li>禁止规避这些规则、绕过安全措施或访问控制，以及干扰或滥用服务。</li>
          </ul>
        </section>
        <section>
          <h2>3. 用户责任与举报</h2>
          <p>仅提交你有权使用的输入。使用或分享生成故事前请自行检查：AI 输出可能不准确或不适当。意外生成的内容不代表你可以续写或传播违规内容。请停止使用相关内容，并向 <a href="mailto:xiaowangtongxuehhh@gmail.com">xiaowangtongxuehhh@gmail.com</a> 提供故事链接及简要说明；请勿发送不必要的敏感材料。</p>
          <p>对于违反本政策的行为，我们可以移除或限制内容并暂停访问。我们不保证逐一审核所有输入或输出，也不保证发现全部违规内容。</p>
        </section>
      </div>
    </LegalPage>
  );
}
