import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/legal-page";
import { supportEmail } from "@/lib/site-content";

export const metadata: Metadata = { title: "Digital Delivery Policy — JSMF" };

export default function DigitalDeliveryPage() {
  return (
    <LegalPage title="Digital Delivery Policy">
      <LegalSection>
        <p>All JSMF (Jab Studies Met Fun) digital products are delivered electronically.</p>
        <p>
          After successful payment verification, purchased resources are added to your JSMF account and made
          available through My Library.
        </p>
        <p>No physical products are shipped.</p>
        <p>
          If you have completed payment but cannot access your purchase, contact{" "}
          <a href={`mailto:${supportEmail}`} className="font-semibold text-primary">
            {supportEmail}
          </a>{" "}
          with your registered email address and order/payment details.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
