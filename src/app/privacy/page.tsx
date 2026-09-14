import type { Metadata } from "next";
import Link from "next/link";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How InkQuest collects, uses, stores, and shares personal information.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Privacy · InkQuest"
      title="Privacy Policy"
      summary="This policy explains what information InkQuest handles, why it is used, and the choices available to you."
    >
      <section>
        <h2>1. Who we are</h2>
        <p>InkQuest is a web-based interactive Chinese-learning service operated under the InkQuest brand. For questions or privacy requests, contact <a href="mailto:xiaowangtongxuehhh@gmail.com">xiaowangtongxuehhh@gmail.com</a>.</p>
      </section>

      <section>
        <h2>2. Information we collect</h2>
        <ul>
          <li><strong>Account information:</strong> email address, account identifier, and basic profile information received when you sign in by email or through Google.</li>
          <li><strong>Learning and content information:</strong> story selections, generation requests, generated stories, vocabulary activity, and membership or credit status.</li>
          <li><strong>Billing information:</strong> Paddle customer, transaction, and subscription identifiers; purchase status; currency; amount; and related account email. Paddle processes full card or payment-account details, and InkQuest does not receive or store them.</li>
          <li><strong>Usage and technical information:</strong> pages and product events, referral source, first-party session identifiers, browser or device information, IP-derived security information, and server logs.</li>
          <li><strong>On-device information:</strong> reading position, visited passages, saved words, interface preferences, and similar progress data may be stored in your browser’s local storage.</li>
          <li><strong>Communications:</strong> information included when you contact us for help, billing questions, or feedback.</li>
        </ul>
      </section>

      <section>
        <h2>3. How we use information</h2>
        <p>We use information to provide and secure accounts; deliver stories, audio, definitions, and generated content; remember learning progress; process and verify subscriptions; provide support; measure product performance; prevent fraud and abuse; comply with legal obligations; and improve InkQuest.</p>
        <p>Depending on where you live, our legal bases may include performing our contract with you, our legitimate interests in operating and improving the service, compliance with law, and consent where required.</p>
      </section>

      <section>
        <h2>4. Cookies and local storage</h2>
        <p>InkQuest uses essential cookies or similar technologies for authentication, security, and session continuity. We also use first-party local storage for reading progress, saved vocabulary, preferences, and basic funnel measurement. You can clear these through your browser, but doing so may sign you out or reset locally stored progress.</p>
      </section>

      <section>
        <h2>5. Service providers and sharing</h2>
        <p>We share information only as needed to operate InkQuest, comply with law, protect rights and safety, or complete a business transfer. Relevant providers include:</p>
        <ul>
          <li><strong>Paddle</strong> for checkout, payments, tax, invoices, subscriptions, fraud prevention, and refunds.</li>
          <li><strong>Supabase</strong> for authentication, databases, and file storage.</li>
          <li><strong>Cloudflare</strong> for hosting, delivery, queues, security, and operational logs.</li>
          <li><strong>Google</strong> when you choose Google sign-in.</li>
          <li><strong>Language-model and speech providers</strong> when needed to generate requested stories or audio.</li>
        </ul>
        <p>These providers process information under their own terms and privacy notices. We do not sell personal information or share it for cross-context behavioral advertising.</p>
      </section>

      <section>
        <h2>6. International processing</h2>
        <p>InkQuest and its providers may process information in countries other than your own. Where required, appropriate legal safeguards are used for international transfers.</p>
      </section>

      <section>
        <h2>7. Retention</h2>
        <p>We retain account and service information for as long as needed to provide InkQuest and for legitimate operational, security, dispute-resolution, and legal purposes. Billing records may be retained for tax and compliance obligations. Local-storage data remains on your device until you or your browser removes it.</p>
      </section>

      <section>
        <h2>8. Security</h2>
        <p>We use reasonable technical and organizational measures designed to protect information. No online service can guarantee absolute security, so please protect access to your email and sign-in provider.</p>
      </section>

      <section>
        <h2>9. Your choices and rights</h2>
        <p>Depending on applicable law, you may have rights to access, correct, delete, restrict, or obtain a copy of personal information, or object to certain processing. You may also withdraw consent where processing relies on consent. Contact us to make a request. We may need to verify your identity before responding.</p>
        <p>Billing and payment-data requests may need to be handled directly by Paddle. Canceling a subscription does not automatically delete your InkQuest account.</p>
      </section>

      <section>
        <h2>10. Children</h2>
        <p>InkQuest is not directed to children under 13, and we do not knowingly collect personal information from them. If you believe a child has provided information without appropriate permission, contact us so we can investigate and take appropriate action.</p>
      </section>

      <section>
        <h2>11. Changes and contact</h2>
        <p>We may update this policy as InkQuest or applicable requirements change. The current version will be posted here with a revised effective date. Contact <a href="mailto:xiaowangtongxuehhh@gmail.com">xiaowangtongxuehhh@gmail.com</a> with questions or requests. Use of InkQuest is also subject to our <Link href="/terms">Terms of Service</Link>.</p>
      </section>
    </LegalPage>
  );
}
