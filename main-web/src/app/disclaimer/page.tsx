import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/legal-page";

export const metadata: Metadata = { title: "Disclaimer — JSMF" };

export default function DisclaimerPage() {
  return (
    <LegalPage title="Disclaimer">
      <LegalSection>
        <p>JSMF provides educational content for medical examination preparation.</p>
        <p>
          The information provided is for educational purposes and should not be considered medical diagnosis,
          treatment, or professional medical advice.
        </p>
        <p>JSMF does not guarantee any particular exam score, rank, qualification, admission, or result.</p>
        <p>
          JSMF also does not guarantee that any specific question, topic, or concept discussed in its content will
          appear in an examination.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
