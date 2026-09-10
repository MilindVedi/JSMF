import type { Question } from "@/types";

export const PSYCHIATRY_QUESTIONS: Question[] = [
  {
    id: "neet-pg-2021-psychiatry-001",
    examId: "neet-pg",
    year: 2021,
    subjectId: "psychiatry",
    topicId: "psychiatry--mood-disorders",
    stem: "A 32-year-old woman reports persistent low mood, anhedonia, poor sleep, decreased appetite, and feelings of worthlessness for the past six weeks, affecting her work and relationships. According to standard diagnostic criteria, what is the minimum duration of symptoms required to diagnose a major depressive episode?",
    options: [
      { id: "neet-pg-2021-psychiatry-001-a", text: "2 weeks" },
      { id: "neet-pg-2021-psychiatry-001-b", text: "4 weeks" },
      { id: "neet-pg-2021-psychiatry-001-c", text: "6 weeks" },
      { id: "neet-pg-2021-psychiatry-001-d", text: "3 months" },
    ],
    correctOptionId: "neet-pg-2021-psychiatry-001-a",
    explanation:
      "A major depressive episode requires at least five characteristic symptoms, including depressed mood or anhedonia, present nearly every day for a minimum of two consecutive weeks, along with functional impairment. This distinguishes it from transient low mood or adjustment reactions, which do not meet the duration threshold.",
    difficulty: "easy",
  },
  {
    id: "fmge-2022-psychiatry-002",
    examId: "fmge",
    year: 2022,
    subjectId: "psychiatry",
    topicId: "psychiatry--psychotic-disorders",
    stem: "A 24-year-old man describes hearing two voices discussing his actions in the third person as he goes about his day, along with the belief that his thoughts are being broadcast to others. Which category of symptom does 'thought broadcasting' belong to?",
    options: [
      { id: "fmge-2022-psychiatry-002-a", text: "First-rank symptom of schizophrenia" },
      { id: "fmge-2022-psychiatry-002-b", text: "Negative symptom of schizophrenia" },
      { id: "fmge-2022-psychiatry-002-c", text: "Mood-congruent psychotic feature" },
      { id: "fmge-2022-psychiatry-002-d", text: "Catatonic symptom" },
    ],
    correctOptionId: "fmge-2022-psychiatry-002-a",
    explanation:
      "Thought broadcasting, along with third-person running commentary auditory hallucinations, thought insertion/withdrawal, and delusions of control, are classic first-rank (Schneiderian) symptoms of schizophrenia. These positive symptoms carry high diagnostic weight when other causes of psychosis have been excluded.",
    difficulty: "medium",
  },
  {
    id: "inicet-2023-psychiatry-003",
    examId: "inicet",
    year: 2023,
    subjectId: "psychiatry",
    topicId: "psychiatry--anxiety-disorders",
    stem: "A 29-year-old woman experiences recurrent, unexpected episodes of intense fear with palpitations, sweating, chest tightness, and a fear of dying, each lasting about 10 minutes, followed by persistent worry about having another episode. What is the most likely diagnosis?",
    options: [
      { id: "inicet-2023-psychiatry-003-a", text: "Panic disorder" },
      { id: "inicet-2023-psychiatry-003-b", text: "Generalized anxiety disorder" },
      { id: "inicet-2023-psychiatry-003-c", text: "Social anxiety disorder" },
      { id: "inicet-2023-psychiatry-003-d", text: "Specific phobia" },
    ],
    correctOptionId: "inicet-2023-psychiatry-003-a",
    explanation:
      "Panic disorder is characterized by recurrent, unexpected panic attacks with abrupt surges of intense fear accompanied by autonomic symptoms, peaking within minutes, followed by persistent concern about future attacks or their consequences. This pattern of discrete, unexpected episodes distinguishes it from the more continuous worry seen in generalized anxiety disorder.",
    difficulty: "medium",
  },
  {
    id: "neet-pg-2024-psychiatry-004",
    examId: "neet-pg",
    year: 2024,
    subjectId: "psychiatry",
    topicId: "psychiatry--substance-use-disorders",
    stem: "A chronic alcohol-dependent man is admitted for elective surgery and abruptly stops drinking. On the second day, he develops confusion, tremors, visual hallucinations, tachycardia, and hypertension. What is the most likely diagnosis?",
    options: [
      { id: "neet-pg-2024-psychiatry-004-a", text: "Delirium tremens" },
      { id: "neet-pg-2024-psychiatry-004-b", text: "Wernicke encephalopathy" },
      { id: "neet-pg-2024-psychiatry-004-c", text: "Alcoholic hallucinosis" },
      { id: "neet-pg-2024-psychiatry-004-d", text: "Korsakoff syndrome" },
    ],
    correctOptionId: "neet-pg-2024-psychiatry-004-a",
    explanation:
      "Delirium tremens typically develops 48 to 96 hours after abrupt alcohol cessation and presents with confusion, coarse tremor, visual hallucinations, and autonomic hyperactivity such as tachycardia and hypertension. It is a medical emergency with significant mortality if untreated, requiring benzodiazepines and supportive care.",
    difficulty: "medium",
  },
  {
    id: "fmge-2021-psychiatry-005",
    examId: "fmge",
    year: 2021,
    subjectId: "psychiatry",
    topicId: "psychiatry--mood-disorders",
    stem: "A 45-year-old man with bipolar disorder is started on lithium for maintenance therapy. Which baseline investigation is most important before initiating treatment, given lithium's chronic toxicity profile?",
    options: [
      { id: "fmge-2021-psychiatry-005-a", text: "Renal function tests and thyroid function tests" },
      { id: "fmge-2021-psychiatry-005-b", text: "Liver function tests only" },
      { id: "fmge-2021-psychiatry-005-c", text: "Fasting blood glucose only" },
      { id: "fmge-2021-psychiatry-005-d", text: "Chest X-ray only" },
    ],
    correctOptionId: "fmge-2021-psychiatry-005-a",
    explanation:
      "Lithium is excreted almost entirely by the kidneys and can cause nephrogenic diabetes insipidus and hypothyroidism with long-term use, so baseline and periodic monitoring of renal and thyroid function is essential. This helps detect early toxicity and guides safe long-term dosing.",
    difficulty: "easy",
  },
  {
    id: "inicet-2025-psychiatry-006",
    examId: "inicet",
    year: 2025,
    subjectId: "psychiatry",
    topicId: "psychiatry--psychotic-disorders",
    stem: "A patient on long-term antipsychotic therapy develops involuntary, repetitive lip smacking, tongue protrusion, and choreiform movements of the limbs that persist even after the drug is stopped. Which pathophysiological mechanism best explains this presentation?",
    stemFigure: {
      kind: "diagram",
      caption: "Diagram of the nigrostriatal dopamine pathway showing upregulated D2 receptor density after chronic blockade",
    },
    options: [
      { id: "inicet-2025-psychiatry-006-a", text: "Dopamine receptor supersensitivity from chronic D2 blockade" },
      { id: "inicet-2025-psychiatry-006-b", text: "Acute cholinergic rebound in the basal ganglia" },
      { id: "inicet-2025-psychiatry-006-c", text: "Serotonin syndrome from excess serotonergic activity" },
      { id: "inicet-2025-psychiatry-006-d", text: "Acute dystonic reaction from muscle spasm" },
    ],
    correctOptionId: "inicet-2025-psychiatry-006-a",
    explanation:
      "Tardive dyskinesia results from chronic dopamine D2 receptor blockade by antipsychotics, leading to compensatory upregulation and supersensitivity of striatal dopamine receptors. It manifests as involuntary orofacial and choreiform limb movements that often persist or even worsen after the offending drug is withdrawn, unlike acute dystonia which occurs early in treatment.",
    difficulty: "hard",
  },
  {
    id: "neet-pg-2022-psychiatry-007",
    examId: "neet-pg",
    year: 2022,
    subjectId: "psychiatry",
    topicId: "psychiatry--substance-use-disorders",
    stem: "A 19-year-old college student who occasionally uses cannabis reports experiencing intense anxiety, tachycardia, and conjunctival redness shortly after smoking, along with an increased appetite later that evening. Which of these findings is most specific to acute cannabis intoxication rather than a general anxiety response?",
    options: [
      { id: "neet-pg-2022-psychiatry-007-a", text: "Conjunctival injection with increased appetite" },
      { id: "neet-pg-2022-psychiatry-007-b", text: "Tachycardia alone" },
      { id: "neet-pg-2022-psychiatry-007-c", text: "Generalized sweating" },
      { id: "neet-pg-2022-psychiatry-007-d", text: "Insomnia alone" },
    ],
    correctOptionId: "neet-pg-2022-psychiatry-007-a",
    explanation:
      "Conjunctival injection (red eyes) combined with increased appetite ('the munchies') are relatively specific physical signs of acute cannabis intoxication, alongside dry mouth and tachycardia. Tachycardia and anxiety alone are nonspecific and can occur with many substances or primary anxiety states.",
    difficulty: "medium",
  },
];
