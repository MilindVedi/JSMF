import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/legal-page";

export const metadata: Metadata = { title: "Refund & Cancellation Policy — JSMF" };

export default function RefundPolicyPage() {
  return (
    <LegalPage title="Refund & Cancellation Policy">
      <LegalSection heading="Digital Products">
        <p>Due to the digital nature of our products, purchases are generally non-refundable once access has been provided.</p>
        <p>
          If you are charged but cannot access your purchased product, contact{" "}
          <a href="mailto:support@jsmf.me" className="font-semibold text-primary">
            support@jsmf.me
          </a>{" "}
          and we will investigate the issue.
        </p>
      </LegalSection>

      <LegalSection heading="Live Sessions">
        <p>If JSMF cancels a session and does not provide a suitable alternative, eligible participants will receive a refund.</p>
        <p>If a session is rescheduled, participants may attend the rescheduled session or receive a refund where applicable.</p>
        <p>Participant non-attendance generally does not qualify for a refund.</p>
        <p>Approved refunds will be processed through the original payment method.</p>
      </LegalSection>
    </LegalPage>
  );
}
