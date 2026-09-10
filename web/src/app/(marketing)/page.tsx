import { Hero } from "@/components/marketing/hero";
import { ExamsCoveredSection } from "@/components/marketing/exams-covered-section";
import { HowItWorksSection } from "@/components/marketing/how-it-works-section";
import { FeatureGrid } from "@/components/marketing/feature-grid";
import { TeamSection } from "@/components/marketing/team-section";
import { WhyJsmfSection } from "@/components/marketing/why-jsmf-section";
import { QuestionPreviewDemo } from "@/components/marketing/question-preview-demo";
import { RevisionFlowSection } from "@/components/marketing/revision-flow-section";
import { ComingSoonStrip } from "@/components/marketing/coming-soon-strip";
import { CtaSection } from "@/components/marketing/cta-section";
import { FaqAccordion } from "@/components/marketing/faq-accordion";

export default function MarketingHomePage() {
  return (
    <>
      <Hero />
      <ExamsCoveredSection />
      <HowItWorksSection />
      <FeatureGrid />
      <TeamSection />
      <WhyJsmfSection />
      <QuestionPreviewDemo />
      <RevisionFlowSection />
      <ComingSoonStrip />
      <CtaSection />
      <FaqAccordion />
    </>
  );
}
