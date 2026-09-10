import type { Question } from "@/types";

export const ANATOMY_QUESTIONS: Question[] = [
  {
    id: "neet-pg-2021-anatomy-001",
    examId: "neet-pg",
    year: 2021,
    subjectId: "anatomy",
    topicId: "anatomy--upper-limb",
    stem: "A patient sustains a fracture of the surgical neck of the humerus. Which nerve is most at risk of injury?",
    options: [
      { id: "neet-pg-2021-anatomy-001-a", text: "Axillary nerve" },
      { id: "neet-pg-2021-anatomy-001-b", text: "Radial nerve" },
      { id: "neet-pg-2021-anatomy-001-c", text: "Musculocutaneous nerve" },
      { id: "neet-pg-2021-anatomy-001-d", text: "Ulnar nerve" },
    ],
    correctOptionId: "neet-pg-2021-anatomy-001-a",
    explanation:
      "The axillary nerve winds around the surgical neck of the humerus along with the posterior circumflex humeral artery, making it vulnerable in surgical neck fractures. Injury results in deltoid paralysis and a patch of sensory loss over the regimental badge area. The radial nerve is instead at risk in fractures of the mid-shaft of the humerus.",
    difficulty: "easy",
  },
  {
    id: "fmge-2022-anatomy-002",
    examId: "fmge",
    year: 2022,
    subjectId: "anatomy",
    topicId: "anatomy--lower-limb",
    stem: "The femoral triangle is bounded laterally by which structure?",
    options: [
      { id: "fmge-2022-anatomy-002-a", text: "Medial border of sartorius" },
      { id: "fmge-2022-anatomy-002-b", text: "Adductor longus" },
      { id: "fmge-2022-anatomy-002-c", text: "Inguinal ligament" },
      { id: "fmge-2022-anatomy-002-d", text: "Medial border of adductor magnus" },
    ],
    correctOptionId: "fmge-2022-anatomy-002-a",
    explanation:
      "The femoral triangle is bounded superiorly by the inguinal ligament, medially by the medial border of adductor longus, and laterally by the medial border of sartorius. Its floor is formed by adductor longus, pectineus, and iliopsoas, and its roof by fascia lata. It contains the femoral nerve, artery, vein, and canal from lateral to medial.",
    difficulty: "medium",
  },
  {
    id: "inicet-2023-anatomy-003",
    examId: "inicet",
    year: 2023,
    subjectId: "anatomy",
    topicId: "anatomy--neuroanatomy",
    stem: "A lesion confined to the lateral corticospinal tract at the level of the spinal cord produces which of the following clinical findings below the level of the lesion?",
    options: [
      { id: "inicet-2023-anatomy-003-a", text: "Ipsilateral spastic paralysis" },
      { id: "inicet-2023-anatomy-003-b", text: "Contralateral spastic paralysis" },
      { id: "inicet-2023-anatomy-003-c", text: "Ipsilateral loss of pain and temperature" },
      { id: "inicet-2023-anatomy-003-d", text: "Contralateral loss of proprioception" },

    ],
    correctOptionId: "inicet-2023-anatomy-003-a",
    explanation:
      "The lateral corticospinal tract has already decussated in the pyramids of the medulla before descending in the spinal cord, so a lesion within the cord produces ipsilateral upper motor neuron signs, including spastic paralysis, below the level of injury. This is a key feature distinguishing cord-level lesions from those above the decussation.",
    difficulty: "medium",
  },
  {
    id: "neet-pg-2024-anatomy-004",
    examId: "neet-pg",
    year: 2024,
    subjectId: "anatomy",
    topicId: "anatomy--embryology",
    stem: "Failure of fusion of which pharyngeal arch derivatives most commonly leads to a persistent thyroglossal duct?",
    options: [
      { id: "neet-pg-2024-anatomy-004-a", text: "Failure of obliteration of the tract between the foramen cecum and the thyroid" },
      { id: "neet-pg-2024-anatomy-004-b", text: "Failure of descent of the third pharyngeal pouch" },
      { id: "neet-pg-2024-anatomy-004-c", text: "Persistence of the second pharyngeal cleft" },
      { id: "neet-pg-2024-anatomy-004-d", text: "Failure of fusion of the mandibular processes" },
    ],
    correctOptionId: "neet-pg-2024-anatomy-004-a",
    explanation:
      "The thyroid gland develops from a median endodermal downgrowth at the foramen cecum of the tongue and descends into the neck through the thyroglossal duct, which normally obliterates. Failure of this obliteration leaves a persistent thyroglossal duct, which can form a cyst anywhere along the pathway from the tongue base to the thyroid, classically moving with tongue protrusion.",
    difficulty: "medium",
  },
  {
    id: "fmge-2021-anatomy-005",
    examId: "fmge",
    year: 2021,
    subjectId: "anatomy",
    topicId: "anatomy--histology",
    stem: "Which epithelial type lines the majority of the respiratory tract from the trachea to the smaller bronchi?",
    stemFigure: {
      kind: "histology",
      caption:
        "Photomicrograph of tracheal wall showing tall columnar cells with cilia, interspersed goblet cells, and a basement membrane resting on a mixed cellular basal layer, giving a pseudostratified appearance.",
    },
    options: [
      { id: "fmge-2021-anatomy-005-a", text: "Pseudostratified ciliated columnar epithelium with goblet cells" },
      { id: "fmge-2021-anatomy-005-b", text: "Simple cuboidal epithelium" },
      { id: "fmge-2021-anatomy-005-c", text: "Stratified squamous non-keratinized epithelium" },
      { id: "fmge-2021-anatomy-005-d", text: "Simple squamous epithelium" },
    ],
    correctOptionId: "fmge-2021-anatomy-005-a",
    explanation:
      "The trachea and larger bronchi are lined by pseudostratified ciliated columnar epithelium interspersed with mucus-secreting goblet cells, which together move the mucus blanket upward to clear inhaled particles. As airways progressively narrow toward the terminal bronchioles, this epithelium transitions to simple cuboidal epithelium.",
    difficulty: "easy",
  },
  {
    id: "inicet-2025-anatomy-006",
    examId: "inicet",
    year: 2025,
    subjectId: "anatomy",
    topicId: "anatomy--upper-limb",
    stem: "Winging of the scapula, most prominent on pushing against a wall, is characteristically caused by paralysis of which muscle?",
    options: [
      { id: "inicet-2025-anatomy-006-a", text: "Serratus anterior" },
      { id: "inicet-2025-anatomy-006-b", text: "Rhomboid major" },
      { id: "inicet-2025-anatomy-006-c", text: "Trapezius" },
      { id: "inicet-2025-anatomy-006-d", text: "Levator scapulae" },
    ],
    correctOptionId: "inicet-2025-anatomy-006-a",
    explanation:
      "Serratus anterior, supplied by the long thoracic nerve, keeps the medial border of the scapula applied to the thoracic wall by rotating and protracting it. Damage to the long thoracic nerve, as can occur during axillary surgery, paralyzes serratus anterior and produces winging of the scapula that is most obvious when the patient pushes against a wall.",
    difficulty: "medium",
  },
  {
    id: "neet-pg-2022-anatomy-007",
    examId: "neet-pg",
    year: 2022,
    subjectId: "anatomy",
    topicId: "anatomy--lower-limb",
    stem: "Compression of which nerve at the fibular neck classically produces foot drop?",
    options: [
      { id: "neet-pg-2022-anatomy-007-a", text: "Common fibular (peroneal) nerve" },
      { id: "neet-pg-2022-anatomy-007-b", text: "Tibial nerve" },
      { id: "neet-pg-2022-anatomy-007-c", text: "Sural nerve" },
      { id: "neet-pg-2022-anatomy-007-d", text: "Saphenous nerve" },
    ],
    correctOptionId: "neet-pg-2022-anatomy-007-a",
    explanation:
      "The common fibular nerve winds superficially around the neck of the fibula, where it is prone to compression from casts, tight bandages, or habitual leg crossing. Injury paralyzes the muscles of dorsiflexion and eversion of the foot, producing a characteristic foot drop with a high-stepping gait.",
    difficulty: "easy",
  },
];
