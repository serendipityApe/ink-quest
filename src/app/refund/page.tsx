import type { Metadata } from "next";
import Link from "next/link";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Refund Policy",
  description: "Cancellation and refund information for InkQuest subscriptions purchased through Paddle.",
  alternates: { canonical: "/refund" },
};

export default function RefundPage() {
  return (
    <LegalPage
      eyebrow="Billing · InkQuest"
      title="Refund Policy"
      summary="InkQuest subscriptions are digital products sold and billed by Paddle as Merchant of Record. This page explains cancellation and refund routes."
    >
      <section>
        <h2>1. Canceling a subscription</h2>
        <p>You may cancel an InkQuest subscription at any time through the Paddle buyer portal linked in your purchase or subscription email. Cancellation normally takes effect at the end of your current billing period. You will keep access until that period ends and will not be charged for the next period.</p>
        <p>Canceling stops future renewals; it does not automatically refund a charge already processed.</p>
      </section>

      <section>
        <h2>2. Refund eligibility</h2>
        <p>Refunds are handled by Paddle under the <a href="https://www.paddle.com/legal/refund-policy" target="_blank" rel="noreferrer">Paddle Refund Policy</a>, the <a href="https://www.paddle.com/legal/buyer-terms" target="_blank" rel="noreferrer">Paddle Buyer Terms</a>, and mandatory consumer-protection law. Nothing in this policy limits rights that cannot legally be waived.</p>
        <p>Eligibility may depend on your country, when the request is made, whether digital access has been used, and whether the service was defective, unavailable, or materially different from its description. Paddle may reject requests involving fraud or refund abuse.</p>
      </section>

      <section>
        <h2>3. Technical or access problems</h2>
        <p>If a technical issue prevents or unreasonably delays access to paid InkQuest content, contact us so we can try to restore access. Where the issue cannot be resolved, you may be entitled to a replacement or refund in accordance with Paddle’s policies and applicable law.</p>
      </section>

      <section>
        <h2>4. How to request a refund</h2>
        <ol>
          <li>Visit <a href="https://paddle.net" target="_blank" rel="noreferrer">paddle.net</a> and use Paddle’s buyer support flow; or</li>
          <li>Email <a href="mailto:xiaowangtongxuehhh@gmail.com">xiaowangtongxuehhh@gmail.com</a> with the email used at checkout, the transaction or order reference, and a short description of the issue.</li>
        </ol>
        <p>Do not send full card details. Because Paddle is the seller of record, approved refunds are issued by Paddle to the original payment method. Processing time depends on Paddle, the payment network, and your financial institution.</p>
      </section>

      <section>
        <h2>5. Plan changes and unused time</h2>
        <p>Unless required by law or approved under Paddle’s policy, we do not provide automatic prorated refunds for unused time after cancellation or for a change of mind after digital access has been used.</p>
      </section>

      <section>
        <h2>6. Contact</h2>
        <p>For product-access or service questions, contact <a href="mailto:xiaowangtongxuehhh@gmail.com">xiaowangtongxuehhh@gmail.com</a>. For payment, invoice, cancellation, or refund processing, Paddle buyer support is usually the fastest route. See our <Link href="/terms">Terms of Service</Link> for the subscription terms.</p>
      </section>
    </LegalPage>
  );
}
