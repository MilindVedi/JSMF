import type { Question } from "@/types";

export const FORENSIC_MEDICINE_QUESTIONS: Question[] = [
  {
    id: "neet-pg-2021-forensic-medicine-001",
    examId: "neet-pg",
    year: 2021,
    subjectId: "forensic-medicine",
    topicId: "forensic-medicine--forensic-pathology",
    stem: "A first responder examining a body found indoors notes that rigor mortis is fully established in all muscle groups. Assuming average ambient temperature, this finding is most consistent with a time since death of approximately:",
    options: [
      { id: "neet-pg-2021-forensic-medicine-001-a", text: "12 hours" },
      { id: "neet-pg-2021-forensic-medicine-001-b", text: "1 to 2 hours" },
      { id: "neet-pg-2021-forensic-medicine-001-c", text: "36 to 48 hours" },
      { id: "neet-pg-2021-forensic-medicine-001-d", text: "5 to 6 days" },
    ],
    correctOptionId: "neet-pg-2021-forensic-medicine-001-a",
    explanation:
      "Rigor mortis classically begins around 1 to 2 hours after death, starts in smaller muscles such as those of the face and jaw, and becomes fully established throughout the body by approximately 12 hours under average conditions. It then persists for roughly another 12 hours before beginning to resolve in the same order it appeared, disappearing completely by around 36 to 48 hours.",
    difficulty: "medium",
  },
  {
    id: "fmge-2022-forensic-medicine-002",
    examId: "fmge",
    year: 2022,
    subjectId: "forensic-medicine",
    topicId: "forensic-medicine--toxicology",
    stem: "A patient presents with garlic odor on the breath, vomiting, and rice-water stools following ingestion of a pesticide. Which poison is most likely responsible?",
    options: [
      { id: "fmge-2022-forensic-medicine-002-a", text: "Arsenic" },
      { id: "fmge-2022-forensic-medicine-002-b", text: "Organophosphate" },
      { id: "fmge-2022-forensic-medicine-002-c", text: "Cyanide" },
      { id: "fmge-2022-forensic-medicine-002-d", text: "Barbiturate" },
    ],
    correctOptionId: "fmge-2022-forensic-medicine-002-a",
    explanation:
      "Acute arsenic poisoning classically produces a garlic-like odor on the breath along with severe gastroenteritis presenting as rice-water stools, mimicking cholera. Other features include hypotension and, in survivors, later peripheral neuropathy and Mees' lines on the nails.",
    difficulty: "medium",
  },
  {
    id: "inicet-2023-forensic-medicine-003",
    examId: "inicet",
    year: 2023,
    subjectId: "forensic-medicine",
    topicId: "forensic-medicine--medical-jurisprudence",
    stem: "Under Indian law, informed consent given by a competent adult patient for a surgical procedure is best classified as which type of consent?",
    options: [
      { id: "inicet-2023-forensic-medicine-003-a", text: "Express consent" },
      { id: "inicet-2023-forensic-medicine-003-b", text: "Implied consent" },
      { id: "inicet-2023-forensic-medicine-003-c", text: "Substitute consent" },
      { id: "inicet-2023-forensic-medicine-003-d", text: "Blanket consent" },
    ],
    correctOptionId: "inicet-2023-forensic-medicine-003-a",
    explanation:
      "Express consent is explicitly communicated by the patient, either verbally or in writing, and is required before invasive procedures such as surgery. It must be informed, voluntary, and given by a person with the legal and mental capacity to consent, distinguishing it from implied consent, which is inferred from routine acts such as extending an arm for a blood draw.",
    difficulty: "easy",
  },
  {
    id: "neet-pg-2024-forensic-medicine-004",
    examId: "neet-pg",
    year: 2024,
    subjectId: "forensic-medicine",
    topicId: "forensic-medicine--sexual-offences-examination",
    stem: "During medico-legal examination of an alleged sexual assault survivor, which finding is used mainly to corroborate recent sexual contact rather than to prove or disprove the assault itself?",
    options: [
      { id: "neet-pg-2024-forensic-medicine-004-a", text: "Presence of spermatozoa or seminal stains on samples collected" },
      { id: "neet-pg-2024-forensic-medicine-004-b", text: "Age of the survivor" },
      { id: "neet-pg-2024-forensic-medicine-004-c", text: "Marital status of the survivor" },
      { id: "neet-pg-2024-forensic-medicine-004-d", text: "General built and nutritional status" },
    ],
    correctOptionId: "neet-pg-2024-forensic-medicine-004-a",
    explanation:
      "Detection of spermatozoa or seminal stains on vaginal, anal, or clothing samples supports recent sexual contact but does not by itself establish lack of consent, which is a legal rather than purely medical determination. Absence of such findings also does not rule out assault, since ejaculation may not occur or samples may be collected after spermatozoa are no longer detectable.",
    difficulty: "hard",
  },
  {
    id: "fmge-2021-forensic-medicine-005",
    examId: "fmge",
    year: 2021,
    subjectId: "forensic-medicine",
    topicId: "forensic-medicine--forensic-pathology",
    stem: "A firearm entry wound with a surrounding grey-black discoloration from burning and soot deposition, along with searing of the surrounding skin, suggests firing from which range?",
    options: [
      { id: "fmge-2021-forensic-medicine-005-a", text: "Close range (within a few centimeters)" },
      { id: "fmge-2021-forensic-medicine-005-b", text: "Distant range (beyond a meter)" },
      { id: "fmge-2021-forensic-medicine-005-c", text: "Contact range with no gas escape" },
      { id: "fmge-2021-forensic-medicine-005-d", text: "Indeterminate range beyond visual assessment" },
    ],
    correctOptionId: "fmge-2021-forensic-medicine-005-a",
    explanation:
      "Close range firing, typically within a few centimeters to a couple of feet depending on the weapon, produces soot blackening (tattooing from unburnt powder) and thermal searing of the skin and singeing of surrounding hair due to the flame and hot gases exiting the muzzle. At distant range, only the abrasion collar of the entry wound is seen without soot or searing.",
    explanationFigure: {
      kind: "diagram",
      caption:
        "Cross-sectional diagram of a firearm entry wound at close range, showing a central defect ringed by an abrasion collar, surrounded by a zone of soot blackening and an outer zone of searing with singed hair follicles.",
    },
    difficulty: "medium",
  },
  {
    id: "inicet-2025-forensic-medicine-006",
    examId: "inicet",
    year: 2025,
    subjectId: "forensic-medicine",
    topicId: "forensic-medicine--toxicology",
    stem: "Which antidote is specifically used in the management of organophosphate poisoning to reverse muscarinic effects?",
    options: [
      { id: "inicet-2025-forensic-medicine-006-a", text: "Atropine" },
      { id: "inicet-2025-forensic-medicine-006-b", text: "Naloxone" },
      { id: "inicet-2025-forensic-medicine-006-c", text: "N-acetylcysteine" },
      { id: "inicet-2025-forensic-medicine-006-d", text: "Flumazenil" },
    ],
    correctOptionId: "inicet-2025-forensic-medicine-006-a",
    explanation:
      "Atropine is an anticholinergic that competitively blocks acetylcholine at muscarinic receptors, reversing the bradycardia, bronchorrhea, salivation, and miosis seen in organophosphate poisoning caused by acetylcholinesterase inhibition. Pralidoxime is given alongside atropine to reactivate acetylcholinesterase and address the nicotinic effects, particularly muscle weakness.",
    difficulty: "medium",
  },
  {
    id: "neet-pg-2022-forensic-medicine-007",
    examId: "neet-pg",
    year: 2022,
    subjectId: "forensic-medicine",
    topicId: "forensic-medicine--medical-jurisprudence",
    stem: "A doctor discloses a patient's HIV-positive status to the patient's spouse without the patient's consent, believing it necessary to protect the spouse's health. This action is best justified under which principle?",
    options: [
      { id: "neet-pg-2022-forensic-medicine-007-a", text: "Privileged communication" },
      { id: "neet-pg-2022-forensic-medicine-007-b", text: "Res ipsa loquitur" },
      { id: "neet-pg-2022-forensic-medicine-007-c", text: "Contributory negligence" },
      { id: "neet-pg-2022-forensic-medicine-007-d", text: "Novus actus interveniens" },
    ],
    correctOptionId: "neet-pg-2022-forensic-medicine-007-a",
    explanation:
      "Privileged communication permits a doctor to disclose otherwise confidential patient information without consent when there is a legal or moral duty to protect a third party from a serious identifiable risk, such as informing a spouse at risk of HIV transmission. This is an exception carved out of the general duty of medical confidentiality, and is applied narrowly and only when justified by a genuine public interest or third-party safety concern.",
    difficulty: "hard",
  },
];
