import type { Metadata } from "next";
import Link from "next/link";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms governing your use of InkQuest and its digital subscriptions.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Legal · InkQuest"
      title="Terms of Service"
      summary="These terms govern access to InkQuest, including its interactive Chinese-learning stories and Founding Reader subscription."
    >
      <section>
        <h2>1. About InkQuest</h2>
        <p>InkQuest is a web-based language-learning service operated under the InkQuest brand. It provides interactive Chinese stories, reading tools, audio, vocabulary support, and optional story-generation features. References to “InkQuest,” “we,” “us,” or “our” mean the provider of this service.</p>
        <p>You can contact us at <a href="mailto:xiaowangtongxuehhh@gmail.com">xiaowangtongxuehhh@gmail.com</a>.</p>
      </section>

      <section>
        <h2>2. Acceptance and eligibility</h2>
        <p>By using InkQuest, you agree to these Terms and our <Link href="/privacy">Privacy Policy</Link>. If you do not agree, do not use the service. You must be legally capable of entering into this agreement. If you are under the age of majority where you live, a parent or legal guardian must approve your use.</p>
      </section>

      <section>
        <h2>3. Accounts</h2>
        <p>Some features require an account. You are responsible for providing accurate information, keeping access to your email or sign-in provider secure, and for activity performed through your account. Tell us promptly if you believe your account has been used without permission.</p>
      </section>

      <section>
        <h2>4. Subscriptions, billing, and renewal</h2>
        <p>The Founding Reader plan is a digital subscription billed monthly in U.S. dollars at the price shown on the pricing and checkout pages. It renews automatically each month until canceled. Any taxes and the final amount due are displayed at checkout.</p>
        <p>Paddle acts as Merchant of Record and authorized reseller for paid InkQuest subscriptions. Paddle processes the transaction, payment method, tax, invoice, cancellation, and refund workflow. By purchasing, you also agree to the applicable <a href="https://www.paddle.com/legal/buyer-terms" target="_blank" rel="noreferrer">Paddle Buyer Terms</a>.</p>
        <p>You may cancel at any time through the buyer portal linked in Paddle’s purchase or subscription emails. Cancellation normally takes effect at the end of the current billing period, and access continues until then. See our <Link href="/refund">Refund Policy</Link> for refund information.</p>
      </section>

      <section>
        <h2>5. License and acceptable use</h2>
        <p>We grant you a limited, personal, non-exclusive, non-transferable, revocable license to use InkQuest for lawful personal learning. You may not copy or commercially redistribute the service or its stories, bypass access controls, interfere with service operation, scrape at unreasonable scale, reverse engineer protected components, or use InkQuest to violate another person’s rights or applicable law.</p>
      </section>

      <section>
        <h2>6. Story requests and generated content</h2>
        <p>You are responsible for prompts, selections, names, and other material you submit. You grant us the limited rights needed to process that material and provide the requested story. Do not submit confidential information or material you do not have permission to use.</p>
        <p>Generated stories and language explanations may contain errors or unexpected content. InkQuest is a learning aid, not an accredited course, official translation service, or source of professional advice.</p>
      </section>

      <section>
        <h2>7. Intellectual property</h2>
        <p>InkQuest and its original software, design, branding, and published content are protected by intellectual-property laws. Except for the limited license above, these Terms do not transfer ownership of InkQuest or its content to you.</p>
      </section>

      <section>
        <h2>8. Availability and changes</h2>
        <p>We may improve, add, remove, or temporarily suspend features. Early-access content and catalog size may change. We do not promise that every feature will always be available, but we will not intentionally remove paid access without honoring applicable consumer rights.</p>
      </section>

      <section>
        <h2>9. Suspension and termination</h2>
        <p>We may restrict or terminate access when reasonably necessary to address fraud, abuse, security risks, legal obligations, or material violations of these Terms. You may stop using InkQuest at any time. Termination does not remove obligations or rights that accrued before termination.</p>
      </section>

      <section>
        <h2>10. Disclaimers and liability</h2>
        <p>To the extent permitted by law, InkQuest is provided “as is” and “as available.” We disclaim implied warranties that may lawfully be disclaimed. We are not liable for indirect, incidental, special, or consequential losses arising from use of the service. Nothing in these Terms excludes liability or consumer rights that cannot legally be excluded or limited.</p>
      </section>

      <section>
        <h2>11. Changes to these Terms</h2>
        <p>We may update these Terms to reflect changes to the service, law, or our business. We will post the revised version and update its effective date. Where required, we will provide additional notice before material changes take effect.</p>
      </section>

      <section>
        <h2>12. Contact</h2>
        <p>Questions about these Terms may be sent to <a href="mailto:xiaowangtongxuehhh@gmail.com">xiaowangtongxuehhh@gmail.com</a>.</p>
      </section>
    </LegalPage>
  );
}
