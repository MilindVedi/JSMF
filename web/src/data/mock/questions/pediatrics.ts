import type { Question } from "@/types";

export const PEDIATRICS_QUESTIONS: Question[] = [
  {
    id: "neet-pg-2021-pediatrics-001",
    examId: "neet-pg",
    year: 2021,
    subjectId: "pediatrics",
    topicId: "pediatrics--neonatology",
    stem: "A term neonate born via elective cesarean section at 37 weeks develops respiratory distress with grunting and tachypnea within 4 hours of birth. Chest X-ray shows fluid in the interlobar fissures and prominent perihilar vascular markings, with the distress resolving over the next day. What is the most likely diagnosis?",
    options: [
      { id: "neet-pg-2021-pediatrics-001-a", text: "Transient tachypnea of the newborn" },
      { id: "neet-pg-2021-pediatrics-001-b", text: "Respiratory distress syndrome" },
      { id: "neet-pg-2021-pediatrics-001-c", text: "Meconium aspiration syndrome" },
      { id: "neet-pg-2021-pediatrics-001-d", text: "Congenital diaphragmatic hernia" },
    ],
    correctOptionId: "neet-pg-2021-pediatrics-001-a",
    explanation:
      "Transient tachypnea of the newborn results from delayed clearance of fetal lung fluid, and is classically seen after elective cesarean delivery without labor because the catecholamine surge and mechanical thoracic compression of vaginal birth, which normally aid fluid clearance, are absent. It is typically self-limiting within 24-72 hours, unlike respiratory distress syndrome, which tends to worsen and shows a reticulogranular pattern on X-ray.",
    difficulty: "medium",
  },
  {
    id: "fmge-2022-pediatrics-002",
    examId: "fmge",
    year: 2022,
    subjectId: "pediatrics",
    topicId: "pediatrics--growth-development",
    stem: "According to standard developmental milestones, at what age does a normal infant typically achieve unsupported sitting?",
    options: [
      { id: "fmge-2022-pediatrics-002-a", text: "6 months" },
      { id: "fmge-2022-pediatrics-002-b", text: "3 months" },
      { id: "fmge-2022-pediatrics-002-c", text: "9 months" },
      { id: "fmge-2022-pediatrics-002-d", text: "12 months" },
    ],
    correctOptionId: "fmge-2022-pediatrics-002-a",
    explanation:
      "By 6 months of age, most infants have developed sufficient truncal and postural control to sit without support for a brief period, marking an important gross motor milestone. Delay beyond 9 months raises concern for a motor developmental delay and warrants further evaluation.",
    difficulty: "easy",
  },
  {
    id: "inicet-2023-pediatrics-003",
    examId: "inicet",
    year: 2023,
    subjectId: "pediatrics",
    topicId: "pediatrics--pediatric-infectious-diseases",
    stem: "A 4-year-old child presents with high-grade fever for 6 days, bilateral non-purulent conjunctival injection, a strawberry tongue, erythema of the palms and soles, and cervical lymphadenopathy. What is the most feared complication of this condition if it is left untreated?",
    options: [
      { id: "inicet-2023-pediatrics-003-a", text: "Coronary artery aneurysm" },
      { id: "inicet-2023-pediatrics-003-b", text: "Bacterial meningitis" },
      { id: "inicet-2023-pediatrics-003-c", text: "Acute rheumatic fever" },
      { id: "inicet-2023-pediatrics-003-d", text: "Toxic epidermal necrolysis" },
    ],
    correctOptionId: "inicet-2023-pediatrics-003-a",
    explanation:
      "This clinical picture is characteristic of Kawasaki disease, a medium-vessel vasculitis whose most feared complication is coronary artery aneurysm formation, occurring in up to 25% of untreated children. Prompt treatment with intravenous immunoglobulin and high-dose aspirin within 10 days of fever onset substantially reduces this risk.",
    difficulty: "medium",
  },
  {
    id: "neet-pg-2024-pediatrics-004",
    examId: "neet-pg",
    year: 2024,
    subjectId: "pediatrics",
    topicId: "pediatrics--nutrition-immunization",
    stem: "A 2-year-old child from a low socioeconomic background presents with bilateral pitting pedal edema, a flaky, peeling skin rash, and thin, sparse, reddish-brown hair, as shown. Which nutritional deficiency best explains this presentation?",
    stemFigure: {
      kind: "clinical-photo",
      caption:
        "Photograph showing bilateral pitting pedal edema with a flaky, peeling 'crazy paving' dermatosis and sparse, depigmented reddish-brown hair.",
    },
    options: [
      {
        id: "neet-pg-2024-pediatrics-004-a",
        text: "Kwashiorkor, from protein deficiency with relatively preserved caloric intake",
      },
      { id: "neet-pg-2024-pediatrics-004-b", text: "Marasmus, from total caloric deficiency" },
      { id: "neet-pg-2024-pediatrics-004-c", text: "Isolated vitamin A deficiency" },
      { id: "neet-pg-2024-pediatrics-004-d", text: "Isolated zinc deficiency" },
    ],
    correctOptionId: "neet-pg-2024-pediatrics-004-a",
    explanation:
      "Kwashiorkor results from severe protein deficiency in the setting of relatively preserved total caloric intake, leading to hypoalbuminemia that produces edema, along with characteristic skin depigmentation and flaking and thin, brittle, discolored hair. This contrasts with marasmus, which presents predominantly with severe wasting and loss of subcutaneous fat without edema.",
    difficulty: "hard",
  },
  {
    id: "fmge-2025-pediatrics-005",
    examId: "fmge",
    year: 2025,
    subjectId: "pediatrics",
    topicId: "pediatrics--congenital-disorders",
    stem: "A newborn is noted to have a single palmar crease, upslanting palpebral fissures, epicanthal folds, and marked hypotonia. Which additional finding is most important to screen for immediately, given its strong association with this condition?",
    options: [
      { id: "fmge-2025-pediatrics-005-a", text: "Congenital heart defect, such as an atrioventricular septal defect" },
      { id: "fmge-2025-pediatrics-005-b", text: "Congenital hip dysplasia" },
      { id: "fmge-2025-pediatrics-005-c", text: "Cleft lip and palate" },
      { id: "fmge-2025-pediatrics-005-d", text: "Congenital diaphragmatic hernia" },
    ],
    correctOptionId: "fmge-2025-pediatrics-005-a",
    explanation:
      "This phenotype is classic for Down syndrome (trisomy 21), which is associated with congenital heart defects, most notably atrioventricular septal defects, in a substantial proportion of affected infants. All newborns with suspected Down syndrome should therefore undergo an early echocardiogram regardless of clinical findings on cardiac auscultation.",
    difficulty: "medium",
  },
  {
    id: "inicet-2021-pediatrics-006",
    examId: "inicet",
    year: 2021,
    subjectId: "pediatrics",
    topicId: "pediatrics--neonatology",
    stem: "Which of the following is the most appropriate initial step in the resuscitation of a term newborn who is apneic and floppy immediately after birth?",
    options: [
      {
        id: "inicet-2021-pediatrics-006-a",
        text: "Provide warmth, dry the infant, and stimulate while assessing breathing",
      },
      { id: "inicet-2021-pediatrics-006-b", text: "Begin chest compressions immediately" },
      { id: "inicet-2021-pediatrics-006-c", text: "Administer intravenous epinephrine" },
      { id: "inicet-2021-pediatrics-006-d", text: "Intubate immediately without an initial assessment" },
    ],
    correctOptionId: "inicet-2021-pediatrics-006-a",
    explanation:
      "The initial steps of neonatal resuscitation are to provide warmth, position the airway, dry and stimulate the infant, and then reassess breathing and heart rate before escalating to positive pressure ventilation, compressions, or drugs. Skipping straight to compressions or epinephrine without this initial assessment step is inappropriate and can delay effective, targeted intervention.",
    difficulty: "easy",
  },
  {
    id: "neet-pg-2022-pediatrics-007",
    examId: "neet-pg",
    year: 2022,
    subjectId: "pediatrics",
    topicId: "pediatrics--growth-development",
    stem: "A child speaks in short two-to-three-word sentences, can build a tower of roughly nine cubes, and is able to pedal a tricycle. This developmental profile most closely corresponds to which age?",
    options: [
      { id: "neet-pg-2022-pediatrics-007-a", text: "3 years" },
      { id: "neet-pg-2022-pediatrics-007-b", text: "18 months" },
      { id: "neet-pg-2022-pediatrics-007-c", text: "2 years" },
      { id: "neet-pg-2022-pediatrics-007-d", text: "4 years" },
    ],
    correctOptionId: "neet-pg-2022-pediatrics-007-a",
    explanation:
      "Combining short phrase speech, a nine-cube tower, and the ability to pedal a tricycle together are all classically achieved by around 3 years of age, since tricycle pedaling in particular requires a level of coordinated gross motor control not typically present at 2 years. Each milestone individually could overlap ages, but the combination best fits the 3-year profile.",
    difficulty: "medium",
  },
  {
    id: "fmge-2023-pediatrics-008",
    examId: "fmge",
    year: 2023,
    subjectId: "pediatrics",
    topicId: "pediatrics--pediatric-infectious-diseases",
    stem: "A 6-year-old unvaccinated child presents with a barking cough, inspiratory stridor, and a 'bull neck' appearance from marked cervical lymphadenopathy and soft tissue swelling. Throat examination reveals a grey, adherent pseudomembrane that bleeds when removal is attempted. What is the most likely causative organism?",
    options: [
      { id: "fmge-2023-pediatrics-008-a", text: "Corynebacterium diphtheriae" },
      { id: "fmge-2023-pediatrics-008-b", text: "Bordetella pertussis" },
      { id: "fmge-2023-pediatrics-008-c", text: "Streptococcus pyogenes" },
      { id: "fmge-2023-pediatrics-008-d", text: "Haemophilus influenzae type b" },
    ],
    correctOptionId: "fmge-2023-pediatrics-008-a",
    explanation:
      "The grey, adherent, bleeding pseudomembrane along with the 'bull neck' appearance from cervical lymphadenitis and soft tissue edema is characteristic of diphtheria caused by toxigenic Corynebacterium diphtheriae, occurring almost exclusively in unvaccinated or under-immunized children. The exotoxin produced can also cause myocarditis and demyelinating neuropathy if untreated with antitoxin and antibiotics.",
    difficulty: "hard",
  },
  {
    id: "inicet-2024-pediatrics-009",
    examId: "inicet",
    year: 2024,
    subjectId: "pediatrics",
    topicId: "pediatrics--nutrition-immunization",
    stem: "As per the Universal Immunization Programme of India, at what age is the first dose of measles-containing vaccine administered?",
    options: [
      { id: "inicet-2024-pediatrics-009-a", text: "9 to 12 months" },
      { id: "inicet-2024-pediatrics-009-b", text: "At birth" },
      { id: "inicet-2024-pediatrics-009-c", text: "6 weeks" },
      { id: "inicet-2024-pediatrics-009-d", text: "5 to 6 years" },
    ],
    correctOptionId: "inicet-2024-pediatrics-009-a",
    explanation:
      "The first dose of measles-containing vaccine is given at 9-12 months of age under India's Universal Immunization Programme, timed to occur after maternally transferred antibodies have sufficiently waned to allow an adequate immune response. A second dose is given later in the schedule to boost protection and cover primary vaccine failures.",
    explanationFigure: {
      kind: "chart",
      caption:
        "Immunization schedule chart plotting recommended vaccine doses against age in months and years, highlighting the measles-containing vaccine dose at 9-12 months.",
    },
    difficulty: "medium",
  },
  {
    id: "neet-pg-2025-pediatrics-010",
    examId: "neet-pg",
    year: 2025,
    subjectId: "pediatrics",
    topicId: "pediatrics--congenital-disorders",
    stem: "A newborn presents with a scaphoid abdomen and respiratory distress, and bowel sounds are auscultated over the left hemithorax. Chest X-ray shows bowel loops within the thoracic cavity with the mediastinum shifted to the right. What is the most likely diagnosis?",
    options: [
      { id: "neet-pg-2025-pediatrics-010-a", text: "Congenital diaphragmatic hernia" },
      { id: "neet-pg-2025-pediatrics-010-b", text: "Tracheoesophageal fistula" },
      { id: "neet-pg-2025-pediatrics-010-c", text: "Congenital lobar emphysema" },
      { id: "neet-pg-2025-pediatrics-010-d", text: "Esophageal atresia" },
    ],
    correctOptionId: "neet-pg-2025-pediatrics-010-a",
    explanation:
      "Herniation of abdominal contents through a diaphragmatic defect, most commonly the left posterolateral Bochdalek hernia, produces a scaphoid abdomen, bowel sounds in the chest, and mediastinal shift away from the affected side due to compression of the developing lung. Immediate management focuses on avoiding bag-mask ventilation, which worsens bowel distension, and securing the airway with intubation.",
    difficulty: "medium",
  },
  {
    id: "fmge-2021-pediatrics-011",
    examId: "fmge",
    year: 2021,
    subjectId: "pediatrics",
    topicId: "pediatrics--neonatology",
    stem: "A preterm neonate born at 29 weeks gestation develops progressive abdominal distension, bloody stools, and lethargy on day 10 of life. An abdominal X-ray shows pneumatosis intestinalis. What is the most likely diagnosis?",
    options: [
      { id: "fmge-2021-pediatrics-011-a", text: "Necrotizing enterocolitis" },
      { id: "fmge-2021-pediatrics-011-b", text: "Hirschsprung disease" },
      { id: "fmge-2021-pediatrics-011-c", text: "Meconium ileus" },
      { id: "fmge-2021-pediatrics-011-d", text: "Malrotation with volvulus" },
    ],
    correctOptionId: "fmge-2021-pediatrics-011-a",
    explanation:
      "Pneumatosis intestinalis, gas within the bowel wall produced by bacterial invasion and fermentation, is a hallmark radiographic sign of necrotizing enterocolitis, a condition predominantly affecting preterm infants due to relative bowel wall immaturity and ischemia. Management includes bowel rest, nasogastric decompression, and broad-spectrum antibiotics, with surgery reserved for perforation or clinical deterioration.",
    difficulty: "medium",
  },
  {
    id: "inicet-2022-pediatrics-012",
    examId: "inicet",
    year: 2022,
    subjectId: "pediatrics",
    topicId: "pediatrics--growth-development",
    stem: "A 9-month-old infant fails to achieve independent sitting, shows persistent head lag, and has increased tone in the lower limbs with brisk deep tendon reflexes. Which condition is most likely?",
    options: [
      { id: "inicet-2022-pediatrics-012-a", text: "Cerebral palsy" },
      { id: "inicet-2022-pediatrics-012-b", text: "Duchenne muscular dystrophy" },
      { id: "inicet-2022-pediatrics-012-c", text: "Spinal muscular atrophy" },
      { id: "inicet-2022-pediatrics-012-d", text: "Normal developmental variation" },
    ],
    correctOptionId: "inicet-2022-pediatrics-012-a",
    explanation:
      "The combination of gross motor delay, persistent head lag beyond the expected age, and upper motor neuron signs such as increased lower limb tone and brisk reflexes points to cerebral palsy from a non-progressive insult to the developing brain. This pattern of increased tone helps distinguish it from spinal muscular atrophy and Duchenne muscular dystrophy, both of which typically present with hypotonia or reduced reflexes rather than spasticity.",
    difficulty: "hard",
  },
  {
    id: "neet-pg-2023-pediatrics-013",
    examId: "neet-pg",
    year: 2023,
    subjectId: "pediatrics",
    topicId: "pediatrics--pediatric-infectious-diseases",
    stem: "Which of the following is the most common causative organism of acute bacterial meningitis in children between 1 month and 5 years of age?",
    options: [
      { id: "neet-pg-2023-pediatrics-013-a", text: "Streptococcus pneumoniae" },
      { id: "neet-pg-2023-pediatrics-013-b", text: "Escherichia coli" },
      { id: "neet-pg-2023-pediatrics-013-c", text: "Listeria monocytogenes" },
      { id: "neet-pg-2023-pediatrics-013-d", text: "Group B Streptococcus" },
    ],
    correctOptionId: "neet-pg-2023-pediatrics-013-a",
    explanation:
      "Streptococcus pneumoniae is the leading cause of acute bacterial meningitis beyond the neonatal period, whereas Escherichia coli, Listeria monocytogenes, and Group B Streptococcus are chiefly implicated in neonatal meningitis within the first month of life. Widespread pneumococcal conjugate vaccination has reduced but not eliminated its predominance in this age group.",
    difficulty: "easy",
  },
  {
    id: "fmge-2024-pediatrics-014",
    examId: "fmge",
    year: 2024,
    subjectId: "pediatrics",
    topicId: "pediatrics--nutrition-immunization",
    stem: "A 6-month-old exclusively breastfed infant is being started on complementary feeding. Which of the following best describes the recommended approach according to standard infant feeding guidelines?",
    options: [
      {
        id: "fmge-2024-pediatrics-014-a",
        text: "Continue breastfeeding while introducing energy-dense, iron-rich semi-solid foods",
      },
      { id: "fmge-2024-pediatrics-014-b", text: "Discontinue breastfeeding completely and switch to cow's milk" },
      { id: "fmge-2024-pediatrics-014-c", text: "Delay complementary feeding until 12 months to avoid food allergies" },
      { id: "fmge-2024-pediatrics-014-d", text: "Introduce only fruit juices before any solid foods" },
    ],
    correctOptionId: "fmge-2024-pediatrics-014-a",
    explanation:
      "Current guidelines recommend continued breastfeeding alongside the introduction of nutritionally adequate, iron-rich complementary foods from 6 months of age, since breast milk alone becomes insufficient to meet the infant's increasing iron and energy requirements beyond this point. Delaying complementary feeding, stopping breastfeeding abruptly, or relying on fruit juices are all inconsistent with recommended practice and risk nutritional deficiency.",
    difficulty: "medium",
  },
  {
    id: "inicet-2025-pediatrics-015",
    examId: "inicet",
    year: 2025,
    subjectId: "pediatrics",
    topicId: "pediatrics--congenital-disorders",
    stem: "A newborn is diagnosed with a congenital heart defect characterized by a ventricular septal defect, an overriding aorta, right ventricular outflow tract obstruction, and right ventricular hypertrophy, as illustrated. Which condition does this represent?",
    stemFigure: {
      kind: "diagram",
      caption:
        "Cross-sectional cardiac diagram showing a large ventricular septal defect, an aorta overriding the septum, right ventricular outflow tract obstruction, and right ventricular hypertrophy.",
    },
    options: [
      { id: "inicet-2025-pediatrics-015-a", text: "Tetralogy of Fallot" },
      { id: "inicet-2025-pediatrics-015-b", text: "Transposition of the great arteries" },
      { id: "inicet-2025-pediatrics-015-c", text: "Truncus arteriosus" },
      { id: "inicet-2025-pediatrics-015-d", text: "Total anomalous pulmonary venous connection" },
    ],
    correctOptionId: "inicet-2025-pediatrics-015-a",
    explanation:
      "These four features together define Tetralogy of Fallot, the most common cyanotic congenital heart defect, in which the degree of right ventricular outflow tract obstruction largely determines the severity of cyanosis and the timing of presentation. Affected infants may develop hypercyanotic ('tet') spells, which are managed acutely by knee-to-chest positioning to increase systemic vascular resistance and improve pulmonary blood flow.",
    difficulty: "medium",
  },
  {
    id: "neet-pg-2025-pediatrics-016",
    examId: "neet-pg",
    year: 2025,
    subjectId: "pediatrics",
    topicId: "pediatrics--neonatology",
    stem: "A late preterm neonate develops yellowish discoloration of the skin progressing cephalocaudally to reach the palms and soles by day 4 of life, with a total serum bilirubin markedly elevated for age. Which mechanism best explains why unconjugated hyperbilirubinemia poses a risk of neurotoxicity in neonates?",
    options: [
      {
        id: "neet-pg-2025-pediatrics-016-a",
        text: "Unconjugated bilirubin is lipid-soluble and can cross the blood-brain barrier to deposit in the basal ganglia",
      },
      {
        id: "neet-pg-2025-pediatrics-016-b",
        text: "Conjugated bilirubin binds albumin poorly and precipitates within neural tissue",
      },
      {
        id: "neet-pg-2025-pediatrics-016-c",
        text: "Neonatal hepatic glucuronidation produces a neurotoxic conjugated metabolite",
      },
      {
        id: "neet-pg-2025-pediatrics-016-d",
        text: "Unconjugated bilirubin directly damages the blood-brain barrier endothelium",
      },
    ],
    correctOptionId: "neet-pg-2025-pediatrics-016-a",
    explanation:
      "Unconjugated bilirubin is lipid-soluble and, when present in excess of albumin-binding capacity, can cross the immature neonatal blood-brain barrier and deposit in the basal ganglia and brainstem nuclei, producing kernicterus. Conjugated bilirubin is water-soluble and does not cross the blood-brain barrier in this manner, which is why conjugated hyperbilirubinemia is not considered neurotoxic in the same way.",
    difficulty: "hard",
  },
];
