import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/legal-page";

export const metadata: Metadata = { title: "Privacy Policy — JSMF" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <LegalSection>
        <p>
          JSMF (Jab Studies Met Fun) collects information such as your name, email address, mobile number, account details, and purchase
          information to provide our services.
        </p>
      </LegalSection>

      <LegalSection heading="We use this information to:">
        <ul className="list-disc space-y-1 pl-5">
          <li>Create and manage your account</li>
          <li>Process purchases and provide digital resources</li>
          <li>Register you for sessions</li>
          <li>Send important account, payment, and session-related communications</li>
          <li>Provide customer support and improve our services</li>
        </ul>
      </LegalSection>

      <LegalSection>
        <p>
          Payments are processed through third-party payment providers such as Razorpay. JSMF does not store your
          complete card, UPI, or banking credentials.
        </p>
        <p>
          We may use third-party services for authentication, email, payments, cloud storage, analytics, and
          communication.
        </p>
        <p>
          We take reasonable measures to protect your information and retain it only as necessary for providing our
          services and complying with applicable requirements.
        </p>
        <p>
          For privacy-related questions, contact{" "}
          <a href="mailto:support@jsmf.me" className="font-semibold text-primary">
            support@jsmf.me
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
