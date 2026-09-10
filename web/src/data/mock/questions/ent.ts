import type { Question } from "@/types";

export const ENT_QUESTIONS: Question[] = [
  {
    id: "neet-pg-2021-ent-001",
    examId: "neet-pg",
    year: 2021,
    subjectId: "ent",
    topicId: "ent--ear-disorders",
    stem: "A 30-year-old man presents with progressive conductive hearing loss and tinnitus. Otoscopy is normal, and Rinne test is negative bilaterally with Weber lateralizing to the worse ear. Which condition best explains this presentation?",
    options: [
      { id: "neet-pg-2021-ent-001-a", text: "Otosclerosis" },
      { id: "neet-pg-2021-ent-001-b", text: "Presbycusis" },
      { id: "neet-pg-2021-ent-001-c", text: "Acoustic neuroma" },
      { id: "neet-pg-2021-ent-001-d", text: "Meniere disease" },
    ],
    correctOptionId: "neet-pg-2021-ent-001-a",
    explanation:
      "Otosclerosis causes progressive conductive hearing loss due to fixation of the stapes footplate, typically with a normal-appearing tympanic membrane on otoscopy. This is confirmed by a negative Rinne test on the affected side and Weber lateralizing toward the more affected ear, unlike presbycusis or acoustic neuroma which cause sensorineural loss.",
    difficulty: "medium",
  },
  {
    id: "fmge-2022-ent-002",
    examId: "fmge",
    year: 2022,
    subjectId: "ent",
    topicId: "ent--nose-sinus-disorders",
    stem: "Which sinus is most commonly involved in acute bacterial sinusitis in adults, and which structure primarily drains its secretions?",
    options: [
      { id: "fmge-2022-ent-002-a", text: "Maxillary sinus, draining via the middle meatus" },
      { id: "fmge-2022-ent-002-b", text: "Frontal sinus, draining via the superior meatus" },
      { id: "fmge-2022-ent-002-c", text: "Sphenoid sinus, draining via the sphenoethmoidal recess" },
      { id: "fmge-2022-ent-002-d", text: "Ethmoid sinus, draining via the inferior meatus" },
    ],
    correctOptionId: "fmge-2022-ent-002-a",
    explanation:
      "The maxillary sinus is the largest paranasal sinus and the most frequently affected in acute bacterial sinusitis because its ostium lies high on its medial wall, making gravity-dependent drainage inefficient. It drains into the middle meatus through the osteomeatal complex, and obstruction there predisposes to secondary infection.",
    difficulty: "easy",
  },
  {
    id: "inicet-2023-ent-003",
    examId: "inicet",
    year: 2023,
    subjectId: "ent",
    topicId: "ent--throat-larynx-disorders",
    stem: "A 5-year-old child presents with acute onset high-grade fever, drooling, muffled 'hot potato' voice, and stridor while sitting forward in a tripod position. What is the most appropriate initial management step?",
    stemFigure: {
      kind: "clinical-photo",
      caption: "Child seated in tripod position, leaning forward with neck extended and mouth open, drooling saliva",
    },
    options: [
      { id: "inicet-2023-ent-003-a", text: "Avoid throat examination and arrange urgent airway management in a controlled setting" },
      { id: "inicet-2023-ent-003-b", text: "Perform an immediate direct laryngoscopy at the bedside to inspect the epiglottis" },
      { id: "inicet-2023-ent-003-c", text: "Obtain a lateral neck X-ray before any other intervention" },
      { id: "inicet-2023-ent-003-d", text: "Administer oral antibiotics and reassess in 24 hours" },
    ],
    correctOptionId: "inicet-2023-ent-003-a",
    explanation:
      "This clinical picture is classic for acute epiglottitis, most often caused by Haemophilus influenzae type b. Any attempt to examine the throat or lay the child supine can precipitate complete airway obstruction, so the priority is to keep the child calm and arrange securing of the airway in an operating room or ICU setting with anesthesia and ENT support present.",
    difficulty: "hard",
  },
  {
    id: "neet-pg-2024-ent-004",
    examId: "neet-pg",
    year: 2024,
    subjectId: "ent",
    topicId: "ent--head-neck-tumors",
    stem: "A 55-year-old man with a long history of smoking and alcohol use presents with progressive hoarseness of voice for three months. Which investigation is essential to establish a tissue diagnosis?",
    options: [
      { id: "neet-pg-2024-ent-004-a", text: "Direct laryngoscopy with biopsy" },
      { id: "neet-pg-2024-ent-004-b", text: "Pure tone audiometry" },
      { id: "neet-pg-2024-ent-004-c", text: "Contrast CT neck alone" },
      { id: "neet-pg-2024-ent-004-d", text: "Fine needle aspiration of a cervical node alone" },
    ],
    correctOptionId: "neet-pg-2024-ent-004-a",
    explanation:
      "Progressive hoarseness in an older patient with tobacco and alcohol use is highly suspicious for laryngeal carcinoma, most commonly squamous cell carcinoma of the vocal cord. Direct laryngoscopy allows direct visualization of the lesion and biopsy for histopathological confirmation, which is essential before staging and treatment planning.",
    difficulty: "medium",
  },
  {
    id: "fmge-2021-ent-005",
    examId: "fmge",
    year: 2021,
    subjectId: "ent",
    topicId: "ent--ear-disorders",
    stem: "A child presents with recurrent foul-smelling ear discharge and a retraction pocket with keratin debris in the attic region of the tympanic membrane. What is the most likely diagnosis?",
    options: [
      { id: "fmge-2021-ent-005-a", text: "Cholesteatoma" },
      { id: "fmge-2021-ent-005-b", text: "Acute suppurative otitis media" },
      { id: "fmge-2021-ent-005-c", text: "Otitis externa" },
      { id: "fmge-2021-ent-005-d", text: "Serous otitis media" },
    ],
    correctOptionId: "fmge-2021-ent-005-a",
    explanation:
      "Cholesteatoma presents with chronic foul-smelling discharge and is characterized by keratinizing squamous epithelium collecting in a retraction pocket, classically in the attic (pars flaccida) region. It is locally destructive and can erode ossicles and adjacent bone, so it requires surgical management rather than medical treatment alone.",
    difficulty: "medium",
  },
  {
    id: "inicet-2025-ent-006",
    examId: "inicet",
    year: 2025,
    subjectId: "ent",
    topicId: "ent--nose-sinus-disorders",
    stem: "Which of the following is the most common site of origin of epistaxis in children and young adults?",
    options: [
      { id: "inicet-2025-ent-006-a", text: "Little's area on the anterior nasal septum" },
      { id: "inicet-2025-ent-006-b", text: "Woodruff's plexus posteriorly" },
      { id: "inicet-2025-ent-006-c", text: "Sphenopalatine artery branches" },
      { id: "inicet-2025-ent-006-d", text: "Anterior ethmoidal artery branches" },
    ],
    correctOptionId: "inicet-2025-ent-006-a",
    explanation:
      "Little's area, located on the anteroinferior nasal septum, is a rich anastomotic network called Kiesselbach's plexus formed by branches of the anterior ethmoidal, sphenopalatine, greater palatine, and superior labial arteries. It is the most common site of epistaxis, particularly in children, due to its superficial location and exposure to trauma and drying.",
    difficulty: "easy",
  },
  {
    id: "neet-pg-2022-ent-007",
    examId: "neet-pg",
    year: 2022,
    subjectId: "ent",
    topicId: "ent--throat-larynx-disorders",
    stem: "A 40-year-old woman notes a sensation of a lump in the throat with intermittent difficulty swallowing solids, worse at night, along with regurgitation of undigested food. Barium swallow shows a posterior outpouching at the pharyngoesophageal junction. What is the diagnosis?",
    options: [
      { id: "neet-pg-2022-ent-007-a", text: "Zenker's diverticulum" },
      { id: "neet-pg-2022-ent-007-b", text: "Achalasia cardia" },
      { id: "neet-pg-2022-ent-007-c", text: "Esophageal carcinoma" },
      { id: "neet-pg-2022-ent-007-d", text: "Globus pharyngeus" },
    ],
    correctOptionId: "neet-pg-2022-ent-007-a",
    explanation:
      "Zenker's diverticulum is a pulsion diverticulum that arises through Killian's dehiscence, a weak area in the posterior pharyngeal wall between the cricopharyngeus and inferior constrictor muscles. It classically presents with dysphagia, regurgitation of undigested food, halitosis, and is confirmed by barium swallow showing a posterior outpouching at the pharyngoesophageal junction.",
    difficulty: "hard",
  },
];
