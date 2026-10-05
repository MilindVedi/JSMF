import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/legal-page";
import { businessAddress, supportEmail } from "@/lib/site-content";

export const metadata: Metadata = { title: "About Us — JSMF" };

export default function AboutPage() {
  return (
    <LegalPage title="About JSMF">
      <LegalSection>
        <p>
          JSMF (Jab Studies Met Fun) is a medical education and examination-preparation platform focused on helping students prepare
          through structured resources, interactive sessions, high-yield revision, and question-solving strategies.
        </p>
        <p>JSMF is medically led by Dr. Angad Rai.</p>
        <p>
          Email:{" "}
          <a href={`mailto:${supportEmail}`} className="font-semibold text-primary">
            {supportEmail}
          </a>
        </p>
        <p>
          Address:{" "}
          <a href={businessAddress.mapsUrl} target="_blank" rel="noreferrer" className="font-semibold text-primary">
            {businessAddress.lines.join(", ")}
          </a>
        </p>
      </LegalSection>
    </LegalPage>
  );
}
