import type { Question } from "@/types";

export const PHYSIOLOGY_QUESTIONS: Question[] = [
  {
    id: "neet-pg-2021-physiology-001",
    examId: "neet-pg",
    year: 2021,
    subjectId: "physiology",
    topicId: "physiology--cardiovascular-physiology",
    stem: "During the cardiac cycle, closure of the mitral and tricuspid valves corresponds to which heart sound?",
    options: [
      { id: "neet-pg-2021-physiology-001-a", text: "First heart sound" },
      { id: "neet-pg-2021-physiology-001-b", text: "Second heart sound" },
      { id: "neet-pg-2021-physiology-001-c", text: "Third heart sound" },
      { id: "neet-pg-2021-physiology-001-d", text: "Fourth heart sound" },
    ],
    correctOptionId: "neet-pg-2021-physiology-001-a",
    explanation:
      "The first heart sound marks the onset of ventricular systole and is produced mainly by closure of the atrioventricular valves, the mitral and tricuspid valves, as ventricular pressure rises above atrial pressure. The second heart sound, by contrast, is produced by closure of the aortic and pulmonary valves at the end of systole.",
    difficulty: "easy",
  },
  {
    id: "fmge-2022-physiology-002",
    examId: "fmge",
    year: 2022,
    subjectId: "physiology",
    topicId: "physiology--respiratory-physiology",
    stem: "A rightward shift of the oxygen-hemoglobin dissociation curve is produced by which of the following changes?",
    stemFigure: {
      kind: "chart",
      caption:
        "Oxygen-hemoglobin dissociation curve plotted as percent saturation of hemoglobin against partial pressure of oxygen, showing a sigmoid curve that shifts rightward with increasing temperature, PCO2, and hydrogen ion concentration.",
    },
    options: [
      { id: "fmge-2022-physiology-002-a", text: "Increased temperature and increased 2,3-DPG" },
      { id: "fmge-2022-physiology-002-b", text: "Decreased temperature and decreased hydrogen ion concentration" },
      { id: "fmge-2022-physiology-002-c", text: "Decreased PCO2 and increased pH" },
      { id: "fmge-2022-physiology-002-d", text: "Decreased 2,3-DPG and decreased temperature" },
    ],
    correctOptionId: "fmge-2022-physiology-002-a",
    explanation:
      "A rightward shift of the oxygen-hemoglobin dissociation curve, indicating decreased hemoglobin affinity for oxygen, is caused by increased temperature, increased 2,3-diphosphoglycerate, increased PCO2, and decreased pH, all of which favor oxygen unloading to actively metabolizing tissues. This is known as the Bohr effect when driven by pH and CO2 changes.",
    difficulty: "medium",
  },
  {
    id: "inicet-2023-physiology-003",
    examId: "inicet",
    year: 2023,
    subjectId: "physiology",
    topicId: "physiology--renal-physiology",
    stem: "Which segment of the nephron is primarily responsible for generating the medullary hypertonic interstitium through the countercurrent multiplier mechanism?",
    options: [
      { id: "inicet-2023-physiology-003-a", text: "Loop of Henle" },
      { id: "inicet-2023-physiology-003-b", text: "Proximal convoluted tubule" },
      { id: "inicet-2023-physiology-003-c", text: "Distal convoluted tubule" },
      { id: "inicet-2023-physiology-003-d", text: "Cortical collecting duct" },
    ],
    correctOptionId: "inicet-2023-physiology-003-a",
    explanation:
      "The loop of Henle, through active sodium chloride reabsorption in the thick ascending limb combined with the passive properties of the descending limb, functions as a countercurrent multiplier that establishes the hypertonic medullary interstitial gradient. This gradient is essential for the collecting duct to later reabsorb water and concentrate urine under the action of ADH.",
    difficulty: "medium",
  },
  {
    id: "neet-pg-2024-physiology-004",
    examId: "neet-pg",
    year: 2024,
    subjectId: "physiology",
    topicId: "physiology--endocrine-physiology",
    stem: "Excess secretion of which hormone is responsible for the clinical features of acromegaly in adults?",
    options: [
      { id: "neet-pg-2024-physiology-004-a", text: "Growth hormone" },
      { id: "neet-pg-2024-physiology-004-b", text: "Thyroid-stimulating hormone" },
      { id: "neet-pg-2024-physiology-004-c", text: "Adrenocorticotropic hormone" },
      { id: "neet-pg-2024-physiology-004-d", text: "Prolactin" },
    ],
    correctOptionId: "neet-pg-2024-physiology-004-a",
    explanation:
      "Acromegaly results from excess growth hormone secretion, usually from a pituitary somatotroph adenoma, occurring after epiphyseal closure in adults. It causes enlargement of the hands, feet, jaw, and soft tissues, along with metabolic effects such as insulin resistance, mediated largely through increased hepatic production of insulin-like growth factor 1.",
    difficulty: "easy",
  },
  {
    id: "fmge-2021-physiology-005",
    examId: "fmge",
    year: 2021,
    subjectId: "physiology",
    topicId: "physiology--neurophysiology",
    stem: "Which type of nerve fiber is responsible for conducting fast, sharp, well-localized pain sensation?",
    options: [
      { id: "fmge-2021-physiology-005-a", text: "A-delta fibers" },
      { id: "fmge-2021-physiology-005-b", text: "C fibers" },
      { id: "fmge-2021-physiology-005-c", text: "A-alpha fibers" },
      { id: "fmge-2021-physiology-005-d", text: "B fibers" },
    ],
    correctOptionId: "fmge-2021-physiology-005-a",
    explanation:
      "A-delta fibers are thinly myelinated and conduct rapidly, carrying sharp, well-localized first pain that is felt immediately after a noxious stimulus. C fibers are unmyelinated, conduct more slowly, and are responsible for the dull, poorly localized second pain that follows.",
    difficulty: "medium",
  },
  {
    id: "inicet-2025-physiology-006",
    examId: "inicet",
    year: 2025,
    subjectId: "physiology",
    topicId: "physiology--cardiovascular-physiology",
    stem: "According to the Frank-Starling law of the heart, an increase in venous return primarily increases stroke volume through which mechanism?",
    options: [
      { id: "inicet-2025-physiology-006-a", text: "Increased end-diastolic fiber length increasing the force of ventricular contraction" },
      { id: "inicet-2025-physiology-006-b", text: "Increased heart rate secondary to sympathetic stimulation" },
      { id: "inicet-2025-physiology-006-c", text: "Decreased afterload on the ventricle" },
      { id: "inicet-2025-physiology-006-d", text: "Increased coronary blood flow to the myocardium" },
    ],
    correctOptionId: "inicet-2025-physiology-006-a",
    explanation:
      "The Frank-Starling law states that, within physiological limits, the greater the venous return and consequent stretch of the ventricular myocardium at end-diastole, the greater the force of the subsequent contraction and stroke volume. This intrinsic property allows the heart to match its output automatically to venous return without needing extrinsic neural or hormonal input.",
    difficulty: "medium",
  },
  {
    id: "neet-pg-2022-physiology-007",
    examId: "neet-pg",
    year: 2022,
    subjectId: "physiology",
    topicId: "physiology--respiratory-physiology",
    stem: "The volume of air that remains in the lungs after a maximal forced expiration is termed the:",
    options: [
      { id: "neet-pg-2022-physiology-007-a", text: "Residual volume" },
      { id: "neet-pg-2022-physiology-007-b", text: "Expiratory reserve volume" },
      { id: "neet-pg-2022-physiology-007-c", text: "Functional residual capacity" },
      { id: "neet-pg-2022-physiology-007-d", text: "Tidal volume" },
    ],
    correctOptionId: "neet-pg-2022-physiology-007-a",
    explanation:
      "Residual volume is the air that cannot be expelled from the lungs even after a maximal forced expiration, and it cannot be measured directly by spirometry since it is never exhaled. It keeps the alveoli open and prevents lung collapse, and along with expiratory reserve volume it makes up the functional residual capacity.",
    difficulty: "easy",
  },
];
