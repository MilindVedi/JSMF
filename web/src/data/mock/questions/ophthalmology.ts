import type { Question } from "@/types";

export const OPHTHALMOLOGY_QUESTIONS: Question[] = [
  {
    id: "neet-pg-2021-ophthalmology-001",
    examId: "neet-pg",
    year: 2021,
    subjectId: "ophthalmology",
    topicId: "ophthalmology--cornea-refraction",
    stem: "A 24-year-old contact lens wearer presents with acute pain, photophobia, and a ring-shaped corneal infiltrate. Corneal scraping is most likely to reveal which organism?",
    options: [
      { id: "neet-pg-2021-ophthalmology-001-a", text: "Acanthamoeba species" },
      { id: "neet-pg-2021-ophthalmology-001-b", text: "Streptococcus pneumoniae" },
      { id: "neet-pg-2021-ophthalmology-001-c", text: "Herpes simplex virus" },
      { id: "neet-pg-2021-ophthalmology-001-d", text: "Candida albicans" },
    ],
    correctOptionId: "neet-pg-2021-ophthalmology-001-a",
    explanation:
      "A ring-shaped corneal infiltrate with severe pain disproportionate to clinical signs in a contact lens wearer is classic for Acanthamoeba keratitis. Diagnosis is confirmed by corneal scraping showing cysts or trophozoites, and it is strongly associated with poor lens hygiene or exposure to tap water.",
    difficulty: "medium",
  },
  {
    id: "fmge-2022-ophthalmology-002",
    examId: "fmge",
    year: 2022,
    subjectId: "ophthalmology",
    topicId: "ophthalmology--cataract-lens",
    stem: "Which type of senile cataract characteristically causes early impairment of near vision along with a myopic shift, sometimes allowing an elderly presbyope to read without glasses ('second sight')?",
    options: [
      { id: "fmge-2022-ophthalmology-002-a", text: "Cortical cataract" },
      { id: "fmge-2022-ophthalmology-002-b", text: "Nuclear cataract" },
      { id: "fmge-2022-ophthalmology-002-c", text: "Posterior subcapsular cataract" },
      { id: "fmge-2022-ophthalmology-002-d", text: "Christmas tree cataract" },
    ],
    correctOptionId: "fmge-2022-ophthalmology-002-b",
    explanation:
      "Nuclear sclerosis increases the refractive index of the lens, producing an index myopia that shifts the eye toward nearsightedness. This is why some elderly patients experience transient improvement in near vision, termed 'second sight', before the cataract eventually reduces overall visual acuity.",
    difficulty: "easy",
  },
  {
    id: "inicet-2023-ophthalmology-003",
    examId: "inicet",
    year: 2023,
    subjectId: "ophthalmology",
    topicId: "ophthalmology--glaucoma",
    stem: "A 58-year-old woman presents to the emergency department with sudden severe unilateral eye pain, headache, nausea, and blurred vision with haloes around lights. Examination shows a mid-dilated, non-reacting pupil and a hazy cornea. What is the most appropriate immediate step?",
    stemFigure: {
      kind: "clinical-photo",
      caption: "Right eye showing circumcorneal congestion, corneal edema, and a mid-dilated fixed pupil",
    },
    options: [
      { id: "inicet-2023-ophthalmology-003-a", text: "Start topical and systemic agents to acutely lower intraocular pressure" },
      { id: "inicet-2023-ophthalmology-003-b", text: "Perform immediate laser peripheral iridotomy without medical treatment" },
      { id: "inicet-2023-ophthalmology-003-c", text: "Prescribe topical corticosteroids alone and review in one week" },
      { id: "inicet-2023-ophthalmology-003-d", text: "Reassure the patient and start oral antibiotics for presumed conjunctivitis" },
    ],
    correctOptionId: "inicet-2023-ophthalmology-003-a",
    explanation:
      "This presentation is classic for acute angle-closure glaucoma, an ophthalmic emergency. The priority is medical reduction of intraocular pressure with agents such as topical beta-blockers, topical/systemic carbonic anhydrase inhibitors, and hyperosmotic agents, followed by definitive laser peripheral iridotomy once the cornea clears and inflammation settles.",
    difficulty: "medium",
  },
  {
    id: "neet-pg-2024-ophthalmology-004",
    examId: "neet-pg",
    year: 2024,
    subjectId: "ophthalmology",
    topicId: "ophthalmology--retina-vitreous",
    stem: "A 62-year-old diabetic patient complains of sudden painless loss of vision in one eye. Fundus examination reveals a cherry-red spot at the macula with diffuse retinal whitening. This finding is most characteristic of which condition?",
    options: [
      { id: "neet-pg-2024-ophthalmology-004-a", text: "Central retinal artery occlusion" },
      { id: "neet-pg-2024-ophthalmology-004-b", text: "Central retinal vein occlusion" },
      { id: "neet-pg-2024-ophthalmology-004-c", text: "Retinal detachment" },
      { id: "neet-pg-2024-ophthalmology-004-d", text: "Vitreous hemorrhage" },
    ],
    correctOptionId: "neet-pg-2024-ophthalmology-004-a",
    explanation:
      "Sudden painless monocular vision loss with a cherry-red spot and diffuse retinal opacification is the hallmark of central retinal artery occlusion. The retina swells and appears pale due to ischemia everywhere except at the fovea, where the underlying choroidal circulation shows through as a red spot.",
    difficulty: "easy",
  },
  {
    id: "fmge-2021-ophthalmology-005",
    examId: "fmge",
    year: 2021,
    subjectId: "ophthalmology",
    topicId: "ophthalmology--cornea-refraction",
    stem: "In a patient with high myopia, which type of refractive error correction lens is required, and where does the image of a distant object form in the uncorrected eye?",
    options: [
      { id: "fmge-2021-ophthalmology-005-a", text: "Concave lens; image forms in front of the retina" },
      { id: "fmge-2021-ophthalmology-005-b", text: "Convex lens; image forms behind the retina" },
      { id: "fmge-2021-ophthalmology-005-c", text: "Concave lens; image forms behind the retina" },
      { id: "fmge-2021-ophthalmology-005-d", text: "Convex lens; image forms in front of the retina" },
    ],
    correctOptionId: "fmge-2021-ophthalmology-005-a",
    explanation:
      "In myopia the eyeball is too long or the refractive power too strong, so parallel rays from distant objects converge in front of the retina. A concave (diverging) lens is used to push the focal point back onto the retina, correcting the refractive error.",
    difficulty: "easy",
  },
  {
    id: "inicet-2025-ophthalmology-006",
    examId: "inicet",
    year: 2025,
    subjectId: "ophthalmology",
    topicId: "ophthalmology--retina-vitreous",
    stem: "A 45-year-old man with high myopia reports a sudden shower of floaters followed by a curtain-like shadow progressing across his visual field. What is the most likely diagnosis and its typical underlying mechanism?",
    stemFigure: {
      kind: "diagram",
      caption: "Cross-sectional diagram of the eye showing a horseshoe retinal tear with vitreous traction and subretinal fluid tracking beneath the neurosensory retina",
    },
    options: [
      { id: "inicet-2025-ophthalmology-006-a", text: "Rhegmatogenous retinal detachment due to a retinal break allowing fluid into the subretinal space" },
      { id: "inicet-2025-ophthalmology-006-b", text: "Exudative retinal detachment due to choroidal inflammation" },
      { id: "inicet-2025-ophthalmology-006-c", text: "Tractional retinal detachment due to fibrovascular proliferation" },
      { id: "inicet-2025-ophthalmology-006-d", text: "Central serous chorioretinopathy due to focal RPE leakage" },
    ],
    correctOptionId: "inicet-2025-ophthalmology-006-a",
    explanation:
      "A sudden shower of floaters (from vitreous hemorrhage or pigment cells) followed by a progressive curtain-like visual field defect is classic for rhegmatogenous retinal detachment. It occurs when a retinal break, often from vitreous traction in a myopic eye, allows liquefied vitreous to track beneath the neurosensory retina and separate it from the retinal pigment epithelium.",
    difficulty: "hard",
  },
  {
    id: "neet-pg-2022-ophthalmology-007",
    examId: "neet-pg",
    year: 2022,
    subjectId: "ophthalmology",
    topicId: "ophthalmology--glaucoma",
    stem: "Which of the following is considered the gold standard investigation for measuring intraocular pressure in clinical practice?",
    options: [
      { id: "neet-pg-2022-ophthalmology-007-a", text: "Goldmann applanation tonometry" },
      { id: "neet-pg-2022-ophthalmology-007-b", text: "Non-contact air-puff tonometry" },
      { id: "neet-pg-2022-ophthalmology-007-c", text: "Schiotz indentation tonometry" },
      { id: "neet-pg-2022-ophthalmology-007-d", text: "Ocular response analyzer" },
    ],
    correctOptionId: "neet-pg-2022-ophthalmology-007-a",
    explanation:
      "Goldmann applanation tonometry remains the gold standard for measuring intraocular pressure because it directly applies the Imbert-Fick principle with minimal displacement of ocular fluid, giving highly reproducible readings. Non-contact and Schiotz tonometry are useful screening alternatives but are less accurate.",
    difficulty: "medium",
  },
];
