import type { Question } from "@/types";

export const DERMATOLOGY_QUESTIONS: Question[] = [
  {
    id: "neet-pg-2021-dermatology-001",
    examId: "neet-pg",
    year: 2021,
    subjectId: "dermatology",
    topicId: "dermatology--papulosquamous-disorders",
    stem: "A 28-year-old man presents with well-demarcated, silvery-scaled plaques over the extensor surfaces of both elbows and knees. Gentle scraping of a scale produces pinpoint bleeding. What is this clinical sign called?",
    stemFigure: {
      kind: "clinical-photo",
      caption: "Well-demarcated erythematous plaque with thick silvery scale over the extensor elbow",
    },
    options: [
      { id: "neet-pg-2021-dermatology-001-a", text: "Auspitz sign" },
      { id: "neet-pg-2021-dermatology-001-b", text: "Nikolsky sign" },
      { id: "neet-pg-2021-dermatology-001-c", text: "Darier sign" },
      { id: "neet-pg-2021-dermatology-001-d", text: "Koebner phenomenon" },
    ],
    correctOptionId: "neet-pg-2021-dermatology-001-a",
    explanation:
      "The Auspitz sign refers to pinpoint bleeding points that appear when psoriatic scales are gently scraped off, caused by the thinned suprapapillary epidermis overlying dilated, elongated dermal papillary capillaries. It is a classic bedside diagnostic clue for psoriasis, distinct from the Nikolsky sign seen in blistering disorders.",
    difficulty: "easy",
  },
  {
    id: "fmge-2022-dermatology-002",
    examId: "fmge",
    year: 2022,
    subjectId: "dermatology",
    topicId: "dermatology--leprosy",
    stem: "A patient with a hypopigmented anesthetic patch on the forearm is found to have a thickened ulnar nerve and only 2-3 skin lesions with well-defined borders. Slit skin smear is negative for acid-fast bacilli. Which type of leprosy does this represent per the Ridley-Jopling classification?",
    options: [
      { id: "fmge-2022-dermatology-002-a", text: "Tuberculoid leprosy (TT)" },
      { id: "fmge-2022-dermatology-002-b", text: "Lepromatous leprosy (LL)" },
      { id: "fmge-2022-dermatology-002-c", text: "Borderline lepromatous leprosy (BL)" },
      { id: "fmge-2022-dermatology-002-d", text: "Indeterminate leprosy" },
    ],
    correctOptionId: "fmge-2022-dermatology-002-a",
    explanation:
      "Tuberculoid leprosy is characterized by few, well-defined hypopigmented anesthetic patches, marked nerve thickening due to a strong cell-mediated immune response, and a negative or low bacterial index on slit skin smear. This contrasts with lepromatous leprosy, which shows numerous ill-defined lesions with a high bacterial load and poor cell-mediated immunity.",
    difficulty: "hard",
  },
  {
    id: "inicet-2023-dermatology-003",
    examId: "inicet",
    year: 2023,
    subjectId: "dermatology",
    topicId: "dermatology--sexually-transmitted-infections",
    stem: "A sexually active 26-year-old man presents with a single, painless, indurated ulcer on the glans penis with a clean base and firm non-tender inguinal lymphadenopathy. Which organism is the most likely cause?",
    options: [
      { id: "inicet-2023-dermatology-003-a", text: "Treponema pallidum" },
      { id: "inicet-2023-dermatology-003-b", text: "Haemophilus ducreyi" },
      { id: "inicet-2023-dermatology-003-c", text: "Herpes simplex virus type 2" },
      { id: "inicet-2023-dermatology-003-d", text: "Klebsiella granulomatis" },
    ],
    correctOptionId: "inicet-2023-dermatology-003-a",
    explanation:
      "A single, painless, indurated ulcer with a clean base accompanied by non-tender, firm ('shotty') inguinal lymphadenopathy is the classic presentation of primary syphilis caused by Treponema pallidum. Painful ulcers with suppurative nodes would instead suggest chancroid from Haemophilus ducreyi.",
    difficulty: "medium",
  },
  {
    id: "neet-pg-2024-dermatology-004",
    examId: "neet-pg",
    year: 2024,
    subjectId: "dermatology",
    topicId: "dermatology--infectious-skin-disorders",
    stem: "A child presents with honey-colored crusted lesions around the mouth and nose following minor trauma. Gram stain of the exudate shows gram-positive cocci in clusters. What is the most likely diagnosis?",
    options: [
      { id: "neet-pg-2024-dermatology-004-a", text: "Impetigo contagiosa" },
      { id: "neet-pg-2024-dermatology-004-b", text: "Erysipelas" },
      { id: "neet-pg-2024-dermatology-004-c", text: "Cellulitis" },
      { id: "neet-pg-2024-dermatology-004-d", text: "Ecthyma" },
    ],
    correctOptionId: "neet-pg-2024-dermatology-004-a",
    explanation:
      "Impetigo contagiosa classically presents with honey-colored crusted lesions around the mouth and nose in children, most commonly caused by Staphylococcus aureus and sometimes Streptococcus pyogenes. It is a superficial infection confined to the epidermis, unlike ecthyma which extends into the dermis and leaves scarring.",
    difficulty: "easy",
  },
  {
    id: "fmge-2021-dermatology-005",
    examId: "fmge",
    year: 2021,
    subjectId: "dermatology",
    topicId: "dermatology--papulosquamous-disorders",
    stem: "A 35-year-old woman presents with violaceous, flat-topped, polygonal pruritic papules over the flexor aspects of the wrists, with fine white lacy streaks visible on the surface of the lesions. What is this surface finding called?",
    stemFigure: {
      kind: "clinical-photo",
      caption: "Flexor wrist with violaceous polygonal papules showing fine white lacy surface streaks",
    },
    options: [
      { id: "fmge-2021-dermatology-005-a", text: "Wickham's striae" },
      { id: "fmge-2021-dermatology-005-b", text: "Auspitz sign" },
      { id: "fmge-2021-dermatology-005-c", text: "Nikolsky sign" },
      { id: "fmge-2021-dermatology-005-d", text: "Trousseau sign" },
    ],
    correctOptionId: "fmge-2021-dermatology-005-a",
    explanation:
      "Wickham's striae are fine, lacy white lines seen on the surface of the violaceous, flat-topped, polygonal papules of lichen planus, best appreciated after applying a drop of oil or water. This finding, along with the classic distribution over flexor wrists, helps distinguish lichen planus from other papulosquamous disorders.",
    difficulty: "medium",
  },
  {
    id: "inicet-2025-dermatology-006",
    examId: "inicet",
    year: 2025,
    subjectId: "dermatology",
    topicId: "dermatology--infectious-skin-disorders",
    stem: "A farmer presents with an itchy, serpiginous, raised, erythematous track on the sole of the foot that has slowly advanced over several days after walking barefoot on sandy soil. What is the most likely diagnosis?",
    options: [
      { id: "inicet-2025-dermatology-006-a", text: "Cutaneous larva migrans" },
      { id: "inicet-2025-dermatology-006-b", text: "Tinea pedis" },
      { id: "inicet-2025-dermatology-006-c", text: "Scabies" },
      { id: "inicet-2025-dermatology-006-d", text: "Larva currens" },
    ],
    correctOptionId: "inicet-2025-dermatology-006-a",
    explanation:
      "Cutaneous larva migrans is caused by percutaneous penetration of hookworm larvae, typically Ancylostoma braziliense, from contaminated soil. It produces an intensely pruritic, serpiginous, slowly migrating erythematous track, most often on the feet after walking barefoot on sand contaminated with animal feces.",
    difficulty: "medium",
  },
  {
    id: "neet-pg-2022-dermatology-007",
    examId: "neet-pg",
    year: 2022,
    subjectId: "dermatology",
    topicId: "dermatology--sexually-transmitted-infections",
    stem: "A young woman presents with painless, cauliflower-like, papillomatous growths over the vulva. Histopathology of a biopsy shows koilocytes. Which organism is responsible for this lesion?",
    options: [
      { id: "neet-pg-2022-dermatology-007-a", text: "Human papillomavirus" },
      { id: "neet-pg-2022-dermatology-007-b", text: "Treponema pallidum" },
      { id: "neet-pg-2022-dermatology-007-c", text: "Herpes simplex virus" },
      { id: "neet-pg-2022-dermatology-007-d", text: "Molluscum contagiosum virus" },
    ],
    correctOptionId: "neet-pg-2022-dermatology-007-a",
    explanation:
      "Condyloma acuminata, presenting as painless cauliflower-like papillomatous genital growths, is caused by human papillomavirus, most often low-risk types 6 and 11. Koilocytes, which are squamous cells with perinuclear halos and nuclear atypia, are the characteristic histopathological finding confirming HPV infection.",
    difficulty: "easy",
  },
];
