import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection } from "@/components/legal-page";

export const metadata: Metadata = { title: "Terms & Conditions — JSMF" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms & Conditions">
      <LegalSection>
        <p>By using JSMF, you agree to these Terms &amp; Conditions.</p>
        <p>JSMF provides educational resources, digital products, and online sessions for medical examination preparation.</p>
      </LegalSection>

      <LegalSection>
        <ul className="list-disc space-y-1 pl-5">
          <li>Users must provide accurate account information.</li>
          <li>Accounts are for personal use and should not be shared.</li>
          <li>JSMF&apos;s digital content may not be copied, redistributed, or resold without permission.</li>
          <li>Session dates, timings, and content may be changed when necessary.</li>
          <li>JSMF does not guarantee any particular exam score, rank, qualification, or result.</li>
          <li>No specific question or topic is guaranteed to appear in any examination.</li>
          <li>All JSMF content is provided for educational purposes.</li>
        </ul>
      </LegalSection>

      <LegalSection>
        <p>
          Payments, refunds, and cancellations are governed by our{" "}
          <Link href="/refund-policy" className="font-semibold text-primary">
            Refund &amp; Cancellation Policy
          </Link>
          .
        </p>
        <p>
          For questions, contact{" "}
          <a href="mailto:support@jsmf.me" className="font-semibold text-primary">
            support@jsmf.me
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
