export interface FaqItem {
  question: string;
  answer: string;
}

export const FAQ_ITEMS: FaqItem[] = [
  {
    question: "What are \"memory-based\" or \"recall-based\" PYQs?",
    answer:
      "After each exam sitting, students independently recall and record the questions they remember. JSMF's medical experts review these recalls, identify the underlying concept being tested across multiple independent recollections, and then independently author an original question testing that same concept. JSMF questions are not claimed to be official reproductions of any exam paper.",
  },
  {
    question: "Which exams does JSMF cover?",
    answer:
      "JSMF currently covers NEET-PG, FMGE, and INI-CET, spanning all 19 MBBS subjects and approximately the last five years of exam cycles.",
  },
  {
    question: "How are JSMF questions written?",
    answer:
      "Every question goes through a structured pipeline: recalls are gathered and grouped across sources, a licensed medical professional reviews the underlying concept, independently authors the question and explanation, the question passes automated quality checks, and the same or another reviewing doctor gives final approval before it's published.",
  },
  {
    question: "Can I try questions before subscribing?",
    answer:
      "Yes. The Free plan includes a limited number of practice questions per day so you can experience the question format, explanations, and interface before upgrading.",
  },
  {
    question: "What's the difference between Single Exam Pro and All Access Pro?",
    answer:
      "Single Exam Pro unlocks the full question bank for one exam of your choice. All Access Pro unlocks all three exams — NEET-PG, FMGE, and INI-CET — under a single subscription.",
  },
  {
    question: "Can I report a question if something looks wrong?",
    answer:
      "Yes. Every question has a report action covering wrong answers, wrong explanations, incorrect questions, image issues, or anything else. Reports go directly into our internal content review workflow.",
  },
  {
    question: "Is there an Android or iOS app?",
    answer:
      "A mobile app for Android and iOS, built from a single shared codebase, is planned after the web platform stabilizes. For now, JSMF is available as a web application.",
  },
  {
    question: "Will JSMF offer courses, notes, or PDFs?",
    answer:
      "Yes, eventually. JSMF's first release is deliberately focused on the PYQ question bank experience. Courses, notes, and PDFs are planned future products and will appear as \"Coming Soon\" until they launch.",
  },
];
