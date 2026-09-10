import type { Question } from "@/types";

export const ORTHOPEDICS_QUESTIONS: Question[] = [
  {
    id: "neet-pg-2021-orthopedics-001",
    examId: "neet-pg",
    year: 2021,
    subjectId: "orthopedics",
    topicId: "orthopedics--fractures-trauma",
    stem: "A 70-year-old woman falls on an outstretched hand and presents with a 'dinner fork' deformity of the wrist. Radiographs are most likely to show which fracture?",
    stemFigure: {
      kind: "xray",
      caption:
        "Lateral wrist radiograph showing a transverse fracture of the distal radius approximately 2 to 3 cm proximal to the articular surface, with dorsal displacement and angulation of the distal fragment.",
    },
    options: [
      { id: "neet-pg-2021-orthopedics-001-a", text: "Colles' fracture" },
      { id: "neet-pg-2021-orthopedics-001-b", text: "Smith's fracture" },
      { id: "neet-pg-2021-orthopedics-001-c", text: "Scaphoid fracture" },
      { id: "neet-pg-2021-orthopedics-001-d", text: "Galeazzi fracture" },
    ],
    correctOptionId: "neet-pg-2021-orthopedics-001-a",
    explanation:
      "A Colles' fracture is a fracture of the distal radius with dorsal displacement and angulation of the distal fragment, classically occurring in osteoporotic older adults after a fall on an outstretched hand. The dorsal displacement produces the characteristic 'dinner fork' deformity seen on clinical examination, distinguishing it from a Smith's fracture, in which the distal fragment is displaced volarly.",
    difficulty: "easy",
  },
  {
    id: "fmge-2022-orthopedics-002",
    examId: "fmge",
    year: 2022,
    subjectId: "orthopedics",
    topicId: "orthopedics--bone-tumors",
    stem: "An 'onion-skin' periosteal reaction on radiograph of a long bone in a child is most characteristic of which tumor?",
    options: [
      { id: "fmge-2022-orthopedics-002-a", text: "Ewing's sarcoma" },
      { id: "fmge-2022-orthopedics-002-b", text: "Osteosarcoma" },
      { id: "fmge-2022-orthopedics-002-c", text: "Osteochondroma" },
      { id: "fmge-2022-orthopedics-002-d", text: "Giant cell tumor" },
    ],
    correctOptionId: "fmge-2022-orthopedics-002-a",
    explanation:
      "Ewing's sarcoma, a small round blue cell tumor arising from the diaphysis of long bones in children and adolescents, classically produces a lamellated 'onion-skin' periosteal reaction due to repeated cycles of tumor breakthrough and periosteal new bone formation. It is associated with a characteristic t(11;22) translocation and often presents with pain, swelling, and systemic symptoms mimicking infection.",
    difficulty: "medium",
  },
  {
    id: "inicet-2023-orthopedics-003",
    examId: "inicet",
    year: 2023,
    subjectId: "orthopedics",
    topicId: "orthopedics--joint-disorders",
    stem: "A 55-year-old man presents with acute monoarticular pain and swelling of the first metatarsophalangeal joint. Synovial fluid analysis shows negatively birefringent needle-shaped crystals. Which condition is most likely?",
    options: [
      { id: "inicet-2023-orthopedics-003-a", text: "Gout" },
      { id: "inicet-2023-orthopedics-003-b", text: "Pseudogout" },
      { id: "inicet-2023-orthopedics-003-c", text: "Septic arthritis" },
      { id: "inicet-2023-orthopedics-003-d", text: "Rheumatoid arthritis" },
    ],
    correctOptionId: "inicet-2023-orthopedics-003-a",
    explanation:
      "Gout is caused by deposition of monosodium urate crystals in joints, and the classic presentation is podagra, acute severe pain and swelling of the first metatarsophalangeal joint. Polarized light microscopy of synovial fluid shows negatively birefringent, needle-shaped crystals, in contrast to the positively birefringent, rhomboid-shaped calcium pyrophosphate crystals seen in pseudogout.",
    difficulty: "medium",
  },
  {
    id: "neet-pg-2024-orthopedics-004",
    examId: "neet-pg",
    year: 2024,
    subjectId: "orthopedics",
    topicId: "orthopedics--spine-disorders",
    stem: "A 65-year-old man presents with progressive low back pain and bilateral lower limb claudication that worsens on walking and improves on forward flexion or sitting. This clinical picture is most suggestive of:",
    options: [
      { id: "neet-pg-2024-orthopedics-004-a", text: "Lumbar spinal canal stenosis" },
      { id: "neet-pg-2024-orthopedics-004-b", text: "Acute lumbar disc herniation" },
      { id: "neet-pg-2024-orthopedics-004-c", text: "Ankylosing spondylitis" },
      { id: "neet-pg-2024-orthopedics-004-d", text: "Spondylolisthesis without stenosis" },
    ],
    correctOptionId: "neet-pg-2024-orthopedics-004-a",
    explanation:
      "Lumbar spinal canal stenosis classically presents with neurogenic claudication, bilateral leg pain and heaviness that worsens with walking or standing (extension of the spine) and improves with sitting or forward flexion, which increases the canal's cross-sectional area. This distinguishes it from vascular claudication, which is related to exertion regardless of posture and relieved simply by stopping activity.",
    difficulty: "hard",
  },
  {
    id: "fmge-2021-orthopedics-005",
    examId: "fmge",
    year: 2021,
    subjectId: "orthopedics",
    topicId: "orthopedics--fractures-trauma",
    stem: "Volkmann's ischemic contracture is a known complication of which fracture in children?",
    options: [
      { id: "fmge-2021-orthopedics-005-a", text: "Supracondylar fracture of the humerus" },
      { id: "fmge-2021-orthopedics-005-b", text: "Fracture of the clavicle" },
      { id: "fmge-2021-orthopedics-005-c", text: "Fracture of the distal femur" },
      { id: "fmge-2021-orthopedics-005-d", text: "Greenstick fracture of the radius" },
    ],
    correctOptionId: "fmge-2021-orthopedics-005-a",
    explanation:
      "Supracondylar fracture of the humerus in children can injure or compress the brachial artery, precipitating compartment syndrome of the forearm flexor compartment if not promptly recognized and treated. Untreated ischemia leads to Volkmann's ischemic contracture, characterized by fixed flexion deformity of the wrist and fingers due to muscle necrosis and fibrosis.",
    difficulty: "medium",
  },
  {
    id: "inicet-2025-orthopedics-006",
    examId: "inicet",
    year: 2025,
    subjectId: "orthopedics",
    topicId: "orthopedics--bone-tumors",
    stem: "A 'soap bubble' lytic lesion at the epiphyseal end of a long bone in a skeletally mature young adult is most characteristic of:",
    options: [
      { id: "inicet-2025-orthopedics-006-a", text: "Giant cell tumor of bone" },
      { id: "inicet-2025-orthopedics-006-b", text: "Osteosarcoma" },
      { id: "inicet-2025-orthopedics-006-c", text: "Osteoid osteoma" },
      { id: "inicet-2025-orthopedics-006-d", text: "Simple bone cyst" },
    ],
    correctOptionId: "inicet-2025-orthopedics-006-a",
    explanation:
      "Giant cell tumor of bone typically occurs after epiphyseal closure in young adults aged 20 to 40 and classically arises in the epiphysis, extending to the subchondral bone, producing an eccentric, expansile, lytic lesion with a characteristic 'soap bubble' appearance on radiograph. It is locally aggressive and shows characteristic multinucleated osteoclast-like giant cells on histology.",
    difficulty: "medium",
  },
  {
    id: "neet-pg-2022-orthopedics-007",
    examId: "neet-pg",
    year: 2022,
    subjectId: "orthopedics",
    topicId: "orthopedics--joint-disorders",
    stem: "Which special test is used clinically to assess the integrity of the anterior cruciate ligament of the knee?",
    options: [
      { id: "neet-pg-2022-orthopedics-007-a", text: "Anterior drawer test" },
      { id: "neet-pg-2022-orthopedics-007-b", text: "Posterior drawer test" },
      { id: "neet-pg-2022-orthopedics-007-c", text: "Varus stress test" },
      { id: "neet-pg-2022-orthopedics-007-d", text: "Thomas test" },
    ],
    correctOptionId: "neet-pg-2022-orthopedics-007-a",
    explanation:
      "The anterior drawer test is performed with the knee flexed to about 90 degrees, pulling the tibia forward relative to the femur; excessive anterior translation compared to the uninjured side indicates anterior cruciate ligament insufficiency. The Lachman test, performed at a shallower flexion angle, is considered more sensitive but the anterior drawer remains a widely taught bedside maneuver for the same ligament.",
    difficulty: "easy",
  },
];
