import type { Question } from "@/types";

export const RADIOLOGY_QUESTIONS: Question[] = [
  {
    id: "neet-pg-2021-radiology-001",
    examId: "neet-pg",
    year: 2021,
    subjectId: "radiology",
    topicId: "radiology--chest-imaging",
    stem: "A 60-year-old smoker undergoes a chest X-ray showing a sharply marginated, homogeneous opacity in the right lower zone with an air-fluid level and surrounding consolidation. Which of the following is the most likely diagnosis?",
    stemFigure: {
      kind: "xray",
      caption: "PA chest radiograph showing a right lower zone cavity with an air-fluid level and surrounding consolidation",
    },
    options: [
      { id: "neet-pg-2021-radiology-001-a", text: "Lung abscess" },
      { id: "neet-pg-2021-radiology-001-b", text: "Simple pulmonary cyst" },
      { id: "neet-pg-2021-radiology-001-c", text: "Pneumothorax" },
      { id: "neet-pg-2021-radiology-001-d", text: "Pleural effusion" },
    ],
    correctOptionId: "neet-pg-2021-radiology-001-a",
    explanation:
      "A cavitary lesion with an air-fluid level and surrounding consolidation on chest X-ray is classic for a lung abscess, usually resulting from aspiration or necrotizing pneumonia. The air-fluid level indicates communication between the necrotic cavity and the bronchial tree, distinguishing it from a simple cyst or effusion.",
    difficulty: "medium",
  },
  {
    id: "fmge-2022-radiology-002",
    examId: "fmge",
    year: 2022,
    subjectId: "radiology",
    topicId: "radiology--abdominal-imaging",
    stem: "An erect abdominal X-ray in a patient with sudden severe abdominal pain shows free gas beneath both domes of the diaphragm. What is the most likely underlying cause?",
    options: [
      { id: "fmge-2022-radiology-002-a", text: "Perforated peptic ulcer" },
      { id: "fmge-2022-radiology-002-b", text: "Acute pancreatitis" },
      { id: "fmge-2022-radiology-002-c", text: "Small bowel obstruction" },
      { id: "fmge-2022-radiology-002-d", text: "Renal colic" },
    ],
    correctOptionId: "fmge-2022-radiology-002-a",
    explanation:
      "Free air under the diaphragm on an erect chest or abdominal film indicates pneumoperitoneum, most commonly caused by a perforated hollow viscus such as a peptic ulcer. This finding is a surgical emergency requiring prompt exploration, unlike pancreatitis or obstruction which do not typically produce free intraperitoneal gas.",
    difficulty: "easy",
  },
  {
    id: "inicet-2023-radiology-003",
    examId: "inicet",
    year: 2023,
    subjectId: "radiology",
    topicId: "radiology--neuroimaging",
    stem: "A 55-year-old hypertensive man presents with sudden severe headache and altered sensorium. Non-contrast CT of the brain shows a hyperdense lesion in the region of the basal ganglia with surrounding hypodensity. What does this most likely represent?",
    stemFigure: {
      kind: "ct",
      caption: "Non-contrast axial CT brain showing a hyperdense basal ganglia lesion with perilesional hypodense edema",
    },
    options: [
      { id: "inicet-2023-radiology-003-a", text: "Acute intracerebral hemorrhage" },
      { id: "inicet-2023-radiology-003-b", text: "Acute ischemic infarct" },
      { id: "inicet-2023-radiology-003-c", text: "Subdural hematoma" },
      { id: "inicet-2023-radiology-003-d", text: "Cerebral abscess" },
    ],
    correctOptionId: "inicet-2023-radiology-003-a",
    explanation:
      "Acute intracerebral hemorrhage appears hyperdense on non-contrast CT due to the high protein content and density of clotted blood, most commonly in the basal ganglia in hypertensive patients due to rupture of lenticulostriate artery microaneurysms. Surrounding hypodensity reflects perilesional vasogenic edema, which develops over the following hours to days.",
    difficulty: "medium",
  },
  {
    id: "neet-pg-2024-radiology-004",
    examId: "neet-pg",
    year: 2024,
    subjectId: "radiology",
    topicId: "radiology--musculoskeletal-imaging",
    stem: "A 12-year-old boy presents with pain and swelling around the distal femur. X-ray shows a sunburst periosteal reaction with an associated soft tissue mass and elevation of the periosteum at the lesion margin. What is the most likely diagnosis?",
    options: [
      { id: "neet-pg-2024-radiology-004-a", text: "Osteosarcoma" },
      { id: "neet-pg-2024-radiology-004-b", text: "Osteoid osteoma" },
      { id: "neet-pg-2024-radiology-004-c", text: "Simple bone cyst" },
      { id: "neet-pg-2024-radiology-004-d", text: "Fibrous dysplasia" },
    ],
    correctOptionId: "neet-pg-2024-radiology-004-a",
    explanation:
      "The 'sunburst' periosteal reaction with an associated soft tissue mass and Codman's triangle (periosteal elevation at the lesion margin) is a classic radiographic finding of osteosarcoma, most commonly arising around the knee in adolescents. This aggressive periosteal pattern reflects rapid tumor growth breaking through the cortex.",
    difficulty: "medium",
  },
  {
    id: "fmge-2021-radiology-005",
    examId: "fmge",
    year: 2021,
    subjectId: "radiology",
    topicId: "radiology--chest-imaging",
    stem: "Which imaging finding on a chest X-ray is most characteristic of primary pulmonary tuberculosis in a child?",
    options: [
      { id: "fmge-2021-radiology-005-a", text: "Ghon focus with ipsilateral hilar lymphadenopathy" },
      { id: "fmge-2021-radiology-005-b", text: "Bilateral diffuse miliary nodules only" },
      { id: "fmge-2021-radiology-005-c", text: "Apical cavitation with fibrosis" },
      { id: "fmge-2021-radiology-005-d", text: "Homogeneous whiteout of one hemithorax" },
    ],
    correctOptionId: "fmge-2021-radiology-005-a",
    explanation:
      "Primary pulmonary tuberculosis characteristically produces a Ghon focus, a small peripheral parenchymal lesion, together with enlarged ipsilateral hilar or mediastinal lymph nodes, forming the Ghon complex. Apical cavitation and fibrosis are more typical of post-primary (reactivation) tuberculosis in adults.",
    difficulty: "easy",
  },
  {
    id: "inicet-2025-radiology-006",
    examId: "inicet",
    year: 2025,
    subjectId: "radiology",
    topicId: "radiology--abdominal-imaging",
    stem: "A 45-year-old woman with recurrent right upper quadrant pain undergoes ultrasound of the abdomen, which shows an echogenic focus within the gallbladder lumen with posterior acoustic shadowing that moves with change in patient position. What does this finding indicate?",
    options: [
      { id: "inicet-2025-radiology-006-a", text: "Gallstone" },
      { id: "inicet-2025-radiology-006-b", text: "Gallbladder polyp" },
      { id: "inicet-2025-radiology-006-c", text: "Gallbladder wall thickening from cholecystitis" },
      { id: "inicet-2025-radiology-006-d", text: "Porcelain gallbladder" },
    ],
    correctOptionId: "inicet-2025-radiology-006-a",
    explanation:
      "A mobile echogenic focus with posterior acoustic shadowing that shifts with patient positioning is the classic ultrasound appearance of a gallstone. A polyp, in contrast, is a fixed non-mobile echogenic structure without significant shadowing, which helps differentiate the two on sonography.",
    difficulty: "easy",
  },
  {
    id: "neet-pg-2022-radiology-007",
    examId: "neet-pg",
    year: 2022,
    subjectId: "radiology",
    topicId: "radiology--neuroimaging",
    stem: "A 70-year-old man on warfarin sustains a fall and later develops progressive headache and confusion over two weeks. CT brain shows a crescent-shaped, hypodense extra-axial collection crossing suture lines. What is the most likely diagnosis?",
    options: [
      { id: "neet-pg-2022-radiology-007-a", text: "Chronic subdural hematoma" },
      { id: "neet-pg-2022-radiology-007-b", text: "Acute epidural hematoma" },
      { id: "neet-pg-2022-radiology-007-c", text: "Subarachnoid hemorrhage" },
      { id: "neet-pg-2022-radiology-007-d", text: "Intraventricular hemorrhage" },
    ],
    correctOptionId: "neet-pg-2022-radiology-007-a",
    explanation:
      "A chronic subdural hematoma appears as a crescent-shaped, hypodense to isodense extra-axial collection that crosses suture lines because it lies beneath the dura but outside the arachnoid. It typically presents subacutely to chronically with headache and confusion, especially in elderly or anticoagulated patients, unlike epidural hematomas which are lentiform and do not cross sutures.",
    difficulty: "hard",
  },
];
