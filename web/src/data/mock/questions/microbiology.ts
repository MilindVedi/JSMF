import type { Question } from "@/types";

export const MICROBIOLOGY_QUESTIONS: Question[] = [
  {
    id: "neet-pg-2021-microbiology-001",
    examId: "neet-pg",
    year: 2021,
    subjectId: "microbiology",
    topicId: "microbiology--bacteriology",
    stem: "Which toxin produced by Corynebacterium diphtheriae acts by inhibiting elongation factor-2, blocking protein synthesis in host cells?",
    options: [
      { id: "neet-pg-2021-microbiology-001-a", text: "Diphtheria toxin" },
      { id: "neet-pg-2021-microbiology-001-b", text: "Cholera toxin" },
      { id: "neet-pg-2021-microbiology-001-c", text: "Pertussis toxin" },
      { id: "neet-pg-2021-microbiology-001-d", text: "Botulinum toxin" },
    ],
    correctOptionId: "neet-pg-2021-microbiology-001-a",
    explanation:
      "Diphtheria toxin, encoded by a lysogenic bacteriophage, ADP-ribosylates elongation factor-2, halting the translocation step of protein synthesis and causing cell death. This underlies the characteristic pseudomembrane formation in the pharynx and systemic effects on the heart and nerves seen in diphtheria.",
    difficulty: "medium",
  },
  {
    id: "fmge-2022-microbiology-002",
    examId: "fmge",
    year: 2022,
    subjectId: "microbiology",
    topicId: "microbiology--virology",
    stem: "Which virus is the most common cause of acute viral hepatitis transmitted through the fecal-oral route in India?",
    options: [
      { id: "fmge-2022-microbiology-002-a", text: "Hepatitis A virus" },
      { id: "fmge-2022-microbiology-002-b", text: "Hepatitis B virus" },
      { id: "fmge-2022-microbiology-002-c", text: "Hepatitis C virus" },
      { id: "fmge-2022-microbiology-002-d", text: "Hepatitis D virus" },
    ],
    correctOptionId: "fmge-2022-microbiology-002-a",
    explanation:
      "Hepatitis A virus is a non-enveloped picornavirus transmitted by the fecal-oral route through contaminated food and water, and remains the leading cause of acute viral hepatitis in children and young adults in endemic regions such as India. It typically causes a self-limited illness and does not progress to chronic hepatitis, unlike hepatitis B and C.",
    difficulty: "easy",
  },
  {
    id: "inicet-2023-microbiology-003",
    examId: "inicet",
    year: 2023,
    subjectId: "microbiology",
    topicId: "microbiology--parasitology",
    stem: "A patient from a malaria-endemic area presents with periodic fever every 48 hours and blood smear shows Plasmodium vivax. Which stage in the mosquito is responsible for transmitting infection to a new human host?",
    options: [
      { id: "inicet-2023-microbiology-003-a", text: "Sporozoite" },
      { id: "inicet-2023-microbiology-003-b", text: "Merozoite" },
      { id: "inicet-2023-microbiology-003-c", text: "Gametocyte" },
      { id: "inicet-2023-microbiology-003-d", text: "Trophozoite" },
    ],
    correctOptionId: "inicet-2023-microbiology-003-a",
    explanation:
      "Sporozoites, formed after sexual reproduction and sporogony within the mosquito's gut and salivary glands, are the infective stage injected into a human host during a mosquito bite. Gametocytes, in contrast, are the stage taken up by the mosquito from an infected human to initiate the sexual cycle within the vector.",
    difficulty: "medium",
  },
  {
    id: "neet-pg-2024-microbiology-004",
    examId: "neet-pg",
    year: 2024,
    subjectId: "microbiology",
    topicId: "microbiology--mycology",
    stem: "Which fungal infection classically presents with 'spaghetti and meatballs' appearance on KOH mount of skin scrapings?",
    stemFigure: {
      kind: "histology",
      caption:
        "KOH mount of skin scraping showing short curved hyphal fragments ('spaghetti') admixed with clusters of round budding yeast cells ('meatballs') characteristic of Malassezia furfur.",
    },
    options: [
      { id: "neet-pg-2024-microbiology-004-a", text: "Pityriasis versicolor (Malassezia furfur)" },
      { id: "neet-pg-2024-microbiology-004-b", text: "Tinea corporis" },
      { id: "neet-pg-2024-microbiology-004-c", text: "Candidiasis" },
      { id: "neet-pg-2024-microbiology-004-d", text: "Sporotrichosis" },
    ],
    correctOptionId: "neet-pg-2024-microbiology-004-a",
    explanation:
      "Malassezia furfur, the causative organism of pityriasis versicolor, shows a mixture of short hyphal fragments and clusters of round yeast forms on KOH mount, described as a 'spaghetti and meatballs' pattern. This lipophilic yeast is part of normal skin flora and causes hypo- or hyperpigmented scaly macules, typically on the trunk.",
    difficulty: "medium",
  },
  {
    id: "fmge-2021-microbiology-005",
    examId: "fmge",
    year: 2021,
    subjectId: "microbiology",
    topicId: "microbiology--immunology",
    stem: "Which class of immunoglobulin is the first to be produced in a primary immune response and is the predominant antibody found on the surface of naive B lymphocytes?",
    options: [
      { id: "fmge-2021-microbiology-005-a", text: "IgM" },
      { id: "fmge-2021-microbiology-005-b", text: "IgG" },
      { id: "fmge-2021-microbiology-005-c", text: "IgA" },
      { id: "fmge-2021-microbiology-005-d", text: "IgE" },
    ],
    correctOptionId: "fmge-2021-microbiology-005-a",
    explanation:
      "IgM is the first antibody produced during a primary immune response and, along with IgD, is expressed as a membrane-bound receptor on naive B lymphocytes before antigen exposure. Its large pentameric structure makes it highly efficient at complement activation and agglutination despite lower affinity per binding site compared to IgG.",
    difficulty: "easy",
  },
  {
    id: "inicet-2025-microbiology-006",
    examId: "inicet",
    year: 2025,
    subjectId: "microbiology",
    topicId: "microbiology--bacteriology",
    stem: "Which organism is the most common cause of community-acquired lobar pneumonia in adults?",
    options: [
      { id: "inicet-2025-microbiology-006-a", text: "Streptococcus pneumoniae" },
      { id: "inicet-2025-microbiology-006-b", text: "Klebsiella pneumoniae" },
      { id: "inicet-2025-microbiology-006-c", text: "Mycoplasma pneumoniae" },
      { id: "inicet-2025-microbiology-006-d", text: "Haemophilus influenzae" },
    ],
    correctOptionId: "inicet-2025-microbiology-006-a",
    explanation:
      "Streptococcus pneumoniae, an alpha-hemolytic, lancet-shaped, gram-positive diplococcus, remains the most common cause of typical community-acquired lobar pneumonia in adults. It is characteristically sensitive to optochin and shows bile solubility, features used to distinguish it from other alpha-hemolytic streptococci in the laboratory.",
    difficulty: "easy",
  },
  {
    id: "neet-pg-2022-microbiology-007",
    examId: "neet-pg",
    year: 2022,
    subjectId: "microbiology",
    topicId: "microbiology--virology",
    stem: "A neonate born to an HIV-positive mother should undergo which test to establish the diagnosis of HIV infection before 18 months of age?",
    options: [
      { id: "neet-pg-2022-microbiology-007-a", text: "HIV DNA PCR" },
      { id: "neet-pg-2022-microbiology-007-b", text: "ELISA for HIV antibodies" },
      { id: "neet-pg-2022-microbiology-007-c", text: "Western blot for HIV antibodies" },
      { id: "neet-pg-2022-microbiology-007-d", text: "Rapid antibody test" },
    ],
    correctOptionId: "neet-pg-2022-microbiology-007-a",
    explanation:
      "In infants under 18 months, maternal IgG antibodies cross the placenta and can persist in the child's circulation, making antibody-based tests unreliable for diagnosing true infection. HIV DNA PCR directly detects the proviral genome integrated in the infant's own cells and is therefore the test of choice for early infant diagnosis.",
    difficulty: "hard",
  },
];
