import type { Metadata } from "next";
import Link from "next/link";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Refund Policy",
  description: "Cancellation and refund information for InkQuest generation credits and subscriptions.",
  alternates: { canonical: "/refund" },
};

export default function RefundPage() {
  return (
    <LegalPage
      eyebrow="Billing · InkQuest"
      title="Refund Policy"
      summary="Cancellation and refund routes for InkQuest generation credits purchased through Creem, with support for legacy purchases."
    >
      <section><h2>1. Canceling renewal</h2><p>Cancel future monthly renewals through Manage subscription on our pricing page or the Creem customer portal linked in your receipt. Cancellation does not automatically refund an earlier charge. Paid monthly credits expire at the end of their billing period. Separately purchased credit packs are not removed merely because you cancel.</p></section>
      <section><h2>2. Refund requests</h2><p>If a purchase or service has a problem, contact <a href="mailto:xiaowangtongxuehhh@gmail.com">xiaowangtongxuehhh@gmail.com</a> with your checkout email, order reference, and a description. Do not send card numbers. We review requests individually, including unused credits, delivery failures, duplicate charges, and applicable consumer rights. Cancellation alone does not promise a prorated refund.</p><p>For Creem purchases, approved refunds are processed through Creem to the original payment method. If an issue cannot be resolved with us, use the customer portal or <a href="https://www.creem.io/contact" target="_blank" rel="noreferrer">Creem support</a>. Creem’s <a href="https://www.creem.io/buyer-terms" target="_blank" rel="noreferrer">Buyer Terms</a> and mandatory consumer protections apply. Nothing here limits rights that cannot legally be waived.</p></section>
      <section><h2>3. Credits and refunds</h2><p>A confirmed refund reverses the corresponding credit entitlement, including a proportional adjustment for a partial refund. Credits already used cannot be used again. If a refund or dispute involves spent credits, further generation may be paused for review; contact us to resolve it. Refunds do not delete your stories.</p></section>
      <section><h2>4. Earlier purchases</h2><p>For an earlier Founding Reader membership or a purchase through another provider, use the provider and support details on your original receipt. Its original benefits and billing terms remain unchanged. See our <Link href="/terms">Terms</Link>.</p></section>
    </LegalPage>
  );
}
