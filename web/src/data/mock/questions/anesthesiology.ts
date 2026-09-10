import type { Question } from "@/types";

export const ANESTHESIOLOGY_QUESTIONS: Question[] = [
  {
    id: "neet-pg-2021-anesthesiology-001",
    examId: "neet-pg",
    year: 2021,
    subjectId: "anesthesiology",
    topicId: "anesthesiology--general-anesthesia",
    stem: "During induction of general anesthesia, a young healthy patient develops sudden severe hyperthermia, muscle rigidity, and tachycardia shortly after administration of succinylcholine and a volatile agent. Which drug is used as first-line treatment for this life-threatening reaction?",
    options: [
      { id: "neet-pg-2021-anesthesiology-001-a", text: "Dantrolene" },
      { id: "neet-pg-2021-anesthesiology-001-b", text: "Naloxone" },
      { id: "neet-pg-2021-anesthesiology-001-c", text: "Flumazenil" },
      { id: "neet-pg-2021-anesthesiology-001-d", text: "Physostigmine" },
    ],
    correctOptionId: "neet-pg-2021-anesthesiology-001-a",
    explanation:
      "This presentation is characteristic of malignant hyperthermia, a hypermetabolic crisis triggered by volatile anesthetics and succinylcholine in genetically susceptible individuals due to abnormal ryanodine receptor function. Dantrolene works by inhibiting calcium release from the sarcoplasmic reticulum in skeletal muscle and is the definitive first-line treatment.",
    difficulty: "medium",
  },
  {
    id: "fmge-2022-anesthesiology-002",
    examId: "fmge",
    year: 2022,
    subjectId: "anesthesiology",
    topicId: "anesthesiology--regional-anesthesia",
    stem: "During a spinal anesthesia procedure, the needle is inserted in the midline between two lumbar vertebrae. Which of the following ligaments is pierced immediately before the needle enters the epidural space?",
    options: [
      { id: "fmge-2022-anesthesiology-002-a", text: "Ligamentum flavum" },
      { id: "fmge-2022-anesthesiology-002-b", text: "Supraspinous ligament" },
      { id: "fmge-2022-anesthesiology-002-c", text: "Anterior longitudinal ligament" },
      { id: "fmge-2022-anesthesiology-002-d", text: "Posterior longitudinal ligament" },
    ],
    correctOptionId: "fmge-2022-anesthesiology-002-a",
    explanation:
      "In the midline approach, the needle traverses skin, subcutaneous tissue, supraspinous ligament, interspinous ligament, and finally the ligamentum flavum before entering the epidural space. The characteristic 'give' or loss of resistance felt as the needle passes through the tough ligamentum flavum is used clinically to identify the epidural space.",
    difficulty: "medium",
  },
  {
    id: "inicet-2023-anesthesiology-003",
    examId: "inicet",
    year: 2023,
    subjectId: "anesthesiology",
    topicId: "anesthesiology--critical-care",
    stem: "A patient in the intensive care unit on mechanical ventilation develops sudden hypotension, tachycardia, and absent breath sounds on the left side, with tracheal deviation to the right. What is the most appropriate immediate management?",
    stemFigure: {
      kind: "chart",
      caption: "Ventilator waveform showing rising peak airway pressures with falling oxygen saturation trend",
    },
    options: [
      { id: "inicet-2023-anesthesiology-003-a", text: "Immediate needle decompression of the left chest" },
      { id: "inicet-2023-anesthesiology-003-b", text: "Urgent chest X-ray before any intervention" },
      { id: "inicet-2023-anesthesiology-003-c", text: "Increase positive end-expiratory pressure" },
      { id: "inicet-2023-anesthesiology-003-d", text: "Administer intravenous fluid bolus alone" },
    ],
    correctOptionId: "inicet-2023-anesthesiology-003-a",
    explanation:
      "This presentation is consistent with tension pneumothorax, a life-threatening complication of positive pressure ventilation that causes progressive intrathoracic pressure buildup, mediastinal shift, and cardiovascular collapse. Immediate needle decompression, without waiting for imaging confirmation, is required to relieve the pressure before a definitive chest tube is placed.",
    difficulty: "hard",
  },
  {
    id: "neet-pg-2024-anesthesiology-004",
    examId: "neet-pg",
    year: 2024,
    subjectId: "anesthesiology",
    topicId: "anesthesiology--pain-management",
    stem: "According to the WHO analgesic ladder, which class of drugs is recommended as the first step for treating mild cancer-related pain before progressing to weak or strong opioids?",
    options: [
      { id: "neet-pg-2024-anesthesiology-004-a", text: "Non-opioid analgesics such as paracetamol or NSAIDs" },
      { id: "neet-pg-2024-anesthesiology-004-b", text: "Strong opioids such as morphine" },
      { id: "neet-pg-2024-anesthesiology-004-c", text: "Weak opioids such as tramadol" },
      { id: "neet-pg-2024-anesthesiology-004-d", text: "Regional nerve blocks" },
    ],
    correctOptionId: "neet-pg-2024-anesthesiology-004-a",
    explanation:
      "The WHO analgesic ladder recommends a stepwise approach: non-opioid analgesics with or without adjuvants for mild pain, weak opioids for moderate pain, and strong opioids for severe pain, escalating only as needed. This graded approach helps optimize pain control while minimizing unnecessary opioid exposure and side effects.",
    difficulty: "easy",
  },
  {
    id: "fmge-2021-anesthesiology-005",
    examId: "fmge",
    year: 2021,
    subjectId: "anesthesiology",
    topicId: "anesthesiology--general-anesthesia",
    stem: "Which inhalational anesthetic agent is most associated with a pleasant smell and rapid smooth induction, making it the preferred choice for mask induction in pediatric patients?",
    options: [
      { id: "fmge-2021-anesthesiology-005-a", text: "Sevoflurane" },
      { id: "fmge-2021-anesthesiology-005-b", text: "Isoflurane" },
      { id: "fmge-2021-anesthesiology-005-c", text: "Desflurane" },
      { id: "fmge-2021-anesthesiology-005-d", text: "Halothane" },
    ],
    correctOptionId: "fmge-2021-anesthesiology-005-a",
    explanation:
      "Sevoflurane has a low pungency and non-irritating, pleasant odor along with a low blood-gas solubility coefficient, allowing rapid and smooth mask induction with minimal airway irritation. This makes it the agent of choice for inhalational induction in children, where intravenous access may not yet be established.",
    difficulty: "easy",
  },
  {
    id: "inicet-2025-anesthesiology-006",
    examId: "inicet",
    year: 2025,
    subjectId: "anesthesiology",
    topicId: "anesthesiology--regional-anesthesia",
    stem: "A patient receiving an interscalene brachial plexus block for shoulder surgery develops hoarseness of voice and mild ipsilateral ptosis shortly after the block. What is the most likely explanation for these findings?",
    options: [
      { id: "inicet-2025-anesthesiology-006-a", text: "Local anesthetic spread to the recurrent laryngeal nerve and cervical sympathetic chain" },
      { id: "inicet-2025-anesthesiology-006-b", text: "Local anesthetic systemic toxicity affecting the brainstem" },
      { id: "inicet-2025-anesthesiology-006-c", text: "Accidental intrathecal injection causing total spinal anesthesia" },
      { id: "inicet-2025-anesthesiology-006-d", text: "Pneumothorax from needle injury to the pleura" },
    ],
    correctOptionId: "inicet-2025-anesthesiology-006-a",
    explanation:
      "Because of its proximity to the brachial plexus at the interscalene level, local anesthetic frequently spreads to block the ipsilateral recurrent laryngeal nerve, causing transient hoarseness, and the cervical sympathetic chain, producing Horner's syndrome with ptosis, miosis, and anhidrosis. These are recognized, usually self-limiting side effects rather than signs of a serious complication.",
    difficulty: "hard",
  },
  {
    id: "neet-pg-2022-anesthesiology-007",
    examId: "neet-pg",
    year: 2022,
    subjectId: "anesthesiology",
    topicId: "anesthesiology--critical-care",
    stem: "A patient in septic shock remains hypotensive despite adequate fluid resuscitation. Which vasopressor is recommended as the first-line agent according to standard critical care guidelines?",
    options: [
      { id: "neet-pg-2022-anesthesiology-007-a", text: "Norepinephrine" },
      { id: "neet-pg-2022-anesthesiology-007-b", text: "Dopamine" },
      { id: "neet-pg-2022-anesthesiology-007-c", text: "Phenylephrine" },
      { id: "neet-pg-2022-anesthesiology-007-d", text: "Isoproterenol" },
    ],
    correctOptionId: "neet-pg-2022-anesthesiology-007-a",
    explanation:
      "Norepinephrine is recommended as the first-line vasopressor in septic shock because its potent alpha-adrenergic effect restores vascular tone with a lower risk of tachyarrhythmias compared to dopamine. Additional agents such as vasopressin may be added if blood pressure targets are not achieved with norepinephrine alone.",
    difficulty: "medium",
  },
];
