import type { Question } from "@/types";

export const COMMUNITY_MEDICINE_QUESTIONS: Question[] = [
  {
    id: "neet-pg-2021-community-medicine-001",
    examId: "neet-pg",
    year: 2021,
    subjectId: "community-medicine",
    topicId: "community-medicine--epidemiology",
    stem: "In a case-control study examining the association between smoking and lung cancer, which measure of association is most appropriately calculated?",
    options: [
      { id: "neet-pg-2021-community-medicine-001-a", text: "Odds ratio" },
      { id: "neet-pg-2021-community-medicine-001-b", text: "Relative risk" },
      { id: "neet-pg-2021-community-medicine-001-c", text: "Attributable risk" },
      { id: "neet-pg-2021-community-medicine-001-d", text: "Population attributable risk" },
    ],
    correctOptionId: "neet-pg-2021-community-medicine-001-a",
    explanation:
      "In a case-control study, subjects are selected based on outcome (disease) status rather than exposure status, so the true incidence of disease in exposed and unexposed groups cannot be calculated, making relative risk inappropriate. The odds ratio is instead used, and it closely approximates the relative risk when the disease under study is rare.",
    difficulty: "medium",
  },
  {
    id: "fmge-2022-community-medicine-002",
    examId: "fmge",
    year: 2022,
    subjectId: "community-medicine",
    topicId: "community-medicine--biostatistics",
    stem: "Which measure of central tendency is most affected by extreme outlier values in a data set?",
    options: [
      { id: "fmge-2022-community-medicine-002-a", text: "Mean" },
      { id: "fmge-2022-community-medicine-002-b", text: "Median" },
      { id: "fmge-2022-community-medicine-002-c", text: "Mode" },
      { id: "fmge-2022-community-medicine-002-d", text: "Geometric mean" },
    ],
    correctOptionId: "fmge-2022-community-medicine-002-a",
    explanation:
      "The mean is calculated by summing all values and dividing by the number of observations, so it is heavily influenced by extreme outliers that pull it away from the bulk of the data. The median, being the middle value when data are arranged in order, is far more resistant to outliers and is preferred for skewed distributions.",
    difficulty: "easy",
  },
  {
    id: "inicet-2023-community-medicine-003",
    examId: "inicet",
    year: 2023,
    subjectId: "community-medicine",
    topicId: "community-medicine--nutrition-public-health",
    stem: "Bitot's spots on the conjunctiva in a preschool child are a clinical sign of deficiency of which vitamin?",
    options: [
      { id: "inicet-2023-community-medicine-003-a", text: "Vitamin A" },
      { id: "inicet-2023-community-medicine-003-b", text: "Vitamin C" },
      { id: "inicet-2023-community-medicine-003-c", text: "Vitamin D" },
      { id: "inicet-2023-community-medicine-003-d", text: "Vitamin K" },
    ],
    correctOptionId: "inicet-2023-community-medicine-003-a",
    explanation:
      "Bitot's spots are foamy, triangular, grey-white deposits on the bulbar conjunctiva composed of keratin debris and Corynebacterium xerosis, and represent an early clinical sign of vitamin A deficiency in children. Left untreated, vitamin A deficiency can progress through corneal xerosis to keratomalacia and irreversible blindness.",
    difficulty: "medium",
  },
  {
    id: "neet-pg-2024-community-medicine-004",
    examId: "neet-pg",
    year: 2024,
    subjectId: "community-medicine",
    topicId: "community-medicine--maternal-child-health",
    stem: "As per standard maternal and child health indicators, the maternal mortality ratio is expressed as the number of maternal deaths per how many live births?",
    options: [
      { id: "neet-pg-2024-community-medicine-004-a", text: "100,000 live births" },
      { id: "neet-pg-2024-community-medicine-004-b", text: "1,000 live births" },
      { id: "neet-pg-2024-community-medicine-004-c", text: "10,000 live births" },
      { id: "neet-pg-2024-community-medicine-004-d", text: "1,000,000 live births" },
    ],
    correctOptionId: "neet-pg-2024-community-medicine-004-a",
    explanation:
      "The maternal mortality ratio is defined as the number of maternal deaths occurring during pregnancy, childbirth, or within 42 days of termination of pregnancy, per 100,000 live births in the same period. It is used as a key indicator of the safety of pregnancy and childbirth and the overall quality of maternal health services in a population.",
    difficulty: "easy",
  },
  {
    id: "fmge-2021-community-medicine-005",
    examId: "fmge",
    year: 2021,
    subjectId: "community-medicine",
    topicId: "community-medicine--environmental-health",
    stem: "The most widely used indicator for assessing the degree of organic pollution in a water sample is:",
    options: [
      { id: "fmge-2021-community-medicine-005-a", text: "Biochemical oxygen demand" },
      { id: "fmge-2021-community-medicine-005-b", text: "Total dissolved solids" },
      { id: "fmge-2021-community-medicine-005-c", text: "Turbidity" },
      { id: "fmge-2021-community-medicine-005-d", text: "Residual chlorine" },
    ],
    correctOptionId: "fmge-2021-community-medicine-005-a",
    explanation:
      "Biochemical oxygen demand measures the amount of oxygen consumed by microorganisms while decomposing organic matter in a water sample over five days at 20 degrees Celsius, and is the standard indicator of organic pollution load. Higher biochemical oxygen demand values indicate greater organic contamination and reduced dissolved oxygen available to support aquatic life.",
    difficulty: "medium",
  },
  {
    id: "inicet-2025-community-medicine-006",
    examId: "inicet",
    year: 2025,
    subjectId: "community-medicine",
    topicId: "community-medicine--epidemiology",
    stem: "A screening test with high sensitivity but low specificity, when applied to a population with low disease prevalence, will most likely result in:",
    stemFigure: {
      kind: "chart",
      caption:
        "2x2 contingency table comparing screening test result (positive or negative) against true disease status (present or absent), illustrating a large number of false positives relative to true positives when prevalence is low.",
    },
    options: [
      { id: "inicet-2025-community-medicine-006-a", text: "A high number of false positive results" },
      { id: "inicet-2025-community-medicine-006-b", text: "A high number of false negative results" },
      { id: "inicet-2025-community-medicine-006-c", text: "A high positive predictive value" },
      { id: "inicet-2025-community-medicine-006-d", text: "A high negative predictive value that falls with lower prevalence" },
    ],
    correctOptionId: "inicet-2025-community-medicine-006-a",
    explanation:
      "When specificity is low, a substantial proportion of truly disease-free individuals will test positive, and in a population with low disease prevalence these false positives will vastly outnumber the true positives, lowering the positive predictive value. High sensitivity, however, ensures that few true cases are missed, keeping the negative predictive value high in this scenario.",
    difficulty: "hard",
  },
  {
    id: "neet-pg-2022-community-medicine-007",
    examId: "neet-pg",
    year: 2022,
    subjectId: "community-medicine",
    topicId: "community-medicine--nutrition-public-health",
    stem: "Which of the following best describes the epidemiological transition observed in developing countries such as India over recent decades?",
    options: [
      { id: "neet-pg-2022-community-medicine-007-a", text: "A shift from predominantly communicable diseases toward an increasing burden of non-communicable diseases" },
      { id: "neet-pg-2022-community-medicine-007-b", text: "A shift from non-communicable diseases toward communicable diseases" },
      { id: "neet-pg-2022-community-medicine-007-c", text: "Complete elimination of communicable diseases" },
      { id: "neet-pg-2022-community-medicine-007-d", text: "No change in overall disease burden pattern" },
    ],
    correctOptionId: "neet-pg-2022-community-medicine-007-a",
    explanation:
      "The epidemiological transition describes the shift in a population's predominant causes of morbidity and mortality from infectious and communicable diseases toward chronic non-communicable diseases such as cardiovascular disease, diabetes, and cancer, as living standards and life expectancy improve. India currently faces a dual burden, with communicable diseases still prevalent alongside a rapidly rising non-communicable disease load.",
    difficulty: "medium",
  },
];
