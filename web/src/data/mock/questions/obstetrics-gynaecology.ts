import type { Question } from "@/types";

export const OBSTETRICS_GYNAECOLOGY_QUESTIONS: Question[] = [
  {
    id: "neet-pg-2021-obstetrics-gynaecology-001",
    examId: "neet-pg",
    year: 2021,
    subjectId: "obstetrics-gynaecology",
    topicId: "obstetrics-gynaecology--antenatal-care",
    stem: "A 28-year-old primigravida at 16 weeks gestation undergoes a double marker test that shows a low PAPP-A level and an elevated free beta-hCG level, along with increased nuchal translucency on first-trimester ultrasound. Which fetal condition is this combination most suggestive of?",
    options: [
      { id: "neet-pg-2021-obstetrics-gynaecology-001-a", text: "Trisomy 21 (Down syndrome)" },
      { id: "neet-pg-2021-obstetrics-gynaecology-001-b", text: "Trisomy 18 (Edward syndrome)" },
      { id: "neet-pg-2021-obstetrics-gynaecology-001-c", text: "Trisomy 13 (Patau syndrome)" },
      { id: "neet-pg-2021-obstetrics-gynaecology-001-d", text: "Turner syndrome (45,X)" },
    ],
    correctOptionId: "neet-pg-2021-obstetrics-gynaecology-001-a",
    explanation:
      "Down syndrome classically shows an increased nuchal translucency together with a low PAPP-A and a raised free beta-hCG on first-trimester combined screening. In contrast, trisomy 18 typically shows both PAPP-A and free beta-hCG reduced, which helps distinguish the two on biochemical screening alone.",
    difficulty: "medium",
  },
  {
    id: "fmge-2022-obstetrics-gynaecology-002",
    examId: "fmge",
    year: 2022,
    subjectId: "obstetrics-gynaecology",
    topicId: "obstetrics-gynaecology--labour-delivery",
    stem: "Which of the following is the most common cause of primary postpartum hemorrhage?",
    options: [
      { id: "fmge-2022-obstetrics-gynaecology-002-a", text: "Uterine atony" },
      { id: "fmge-2022-obstetrics-gynaecology-002-b", text: "Retained placental tissue" },
      { id: "fmge-2022-obstetrics-gynaecology-002-c", text: "Genital tract trauma" },
      { id: "fmge-2022-obstetrics-gynaecology-002-d", text: "Coagulopathy" },
    ],
    correctOptionId: "fmge-2022-obstetrics-gynaecology-002-a",
    explanation:
      "Uterine atony accounts for roughly 70-80% of primary postpartum hemorrhage cases, as failure of the myometrium to contract after delivery prevents adequate compression of the spiral arterioles at the placental bed. Trauma, retained tissue, and coagulopathy are important but less frequent causes.",
    difficulty: "easy",
  },
  {
    id: "inicet-2023-obstetrics-gynaecology-003",
    examId: "inicet",
    year: 2023,
    subjectId: "obstetrics-gynaecology",
    topicId: "obstetrics-gynaecology--high-risk-pregnancy",
    stem: "A 32-year-old woman with pregestational type 1 diabetes at 34 weeks gestation undergoes an ultrasound showing polyhydramnios and an estimated fetal weight above the 90th percentile. Which mechanism best explains the fetal macrosomia seen in poorly controlled diabetic pregnancies?",
    options: [
      {
        id: "inicet-2023-obstetrics-gynaecology-003-a",
        text: "Fetal hyperinsulinemia from maternal hyperglycemia acting as an anabolic growth stimulus",
      },
      {
        id: "inicet-2023-obstetrics-gynaecology-003-b",
        text: "Increased maternal growth hormone crossing the placenta",
      },
      {
        id: "inicet-2023-obstetrics-gynaecology-003-c",
        text: "Reduced fetal insulin-like growth factor 1 production",
      },
      {
        id: "inicet-2023-obstetrics-gynaecology-003-d",
        text: "Placental insufficiency causing compensatory fetal overgrowth",
      },
    ],
    correctOptionId: "inicet-2023-obstetrics-gynaecology-003-a",
    explanation:
      "Maternal hyperglycemia crosses the placenta and stimulates the fetal pancreas to secrete excess insulin, which acts as a potent anabolic hormone promoting fat and protein deposition, producing macrosomia (Pedersen hypothesis). Insulin does not cross the placenta itself, so the fetal beta-cell response to maternal glucose is central to this mechanism.",
    difficulty: "medium",
  },
  {
    id: "neet-pg-2024-obstetrics-gynaecology-004",
    examId: "neet-pg",
    year: 2024,
    subjectId: "obstetrics-gynaecology",
    topicId: "obstetrics-gynaecology--gynaecological-oncology",
    stem: "A 55-year-old postmenopausal woman presents with postmenopausal bleeding. Endometrial biopsy is performed and the histology is shown. What is the most likely diagnosis?",
    stemFigure: {
      kind: "histology",
      caption:
        "Endometrial biopsy showing back-to-back glands with cribriform architecture, minimal intervening stroma, and nuclear atypia with loss of cellular polarity.",
    },
    options: [
      { id: "neet-pg-2024-obstetrics-gynaecology-004-a", text: "Endometrioid adenocarcinoma of the endometrium" },
      { id: "neet-pg-2024-obstetrics-gynaecology-004-b", text: "Simple endometrial hyperplasia without atypia" },
      { id: "neet-pg-2024-obstetrics-gynaecology-004-c", text: "Endometrial polyp" },
      { id: "neet-pg-2024-obstetrics-gynaecology-004-d", text: "Atrophic endometrium" },
    ],
    correctOptionId: "neet-pg-2024-obstetrics-gynaecology-004-a",
    explanation:
      "The back-to-back glandular arrangement with minimal intervening stroma and cytologic atypia distinguishes invasive endometrioid adenocarcinoma from simple hyperplasia, in which stroma is preserved between glands despite crowding. Postmenopausal bleeding with this histology mandates staging workup rather than conservative management.",
    difficulty: "hard",
  },
  {
    id: "fmge-2025-obstetrics-gynaecology-005",
    examId: "fmge",
    year: 2025,
    subjectId: "obstetrics-gynaecology",
    topicId: "obstetrics-gynaecology--menstrual-disorders",
    stem: "A 17-year-old girl presents with heavy, irregular menstrual bleeding since menarche two years ago. Pelvic examination and pelvic ultrasound are normal with no structural pathology identified. What is the most likely underlying cause of her abnormal uterine bleeding?",
    options: [
      {
        id: "fmge-2025-obstetrics-gynaecology-005-a",
        text: "Anovulatory cycles due to an immature hypothalamic-pituitary-ovarian axis",
      },
      { id: "fmge-2025-obstetrics-gynaecology-005-b", text: "Uterine leiomyoma" },
      { id: "fmge-2025-obstetrics-gynaecology-005-c", text: "Endometrial polyp" },
      { id: "fmge-2025-obstetrics-gynaecology-005-d", text: "An underlying coagulation disorder" },
    ],
    correctOptionId: "fmge-2025-obstetrics-gynaecology-005-a",
    explanation:
      "In the first few years after menarche, the hypothalamic-pituitary-ovarian axis is frequently still immature, leading to anovulatory cycles with unopposed estrogen exposure and irregular, sometimes heavy, endometrial shedding; this accounts for the vast majority of adolescent abnormal uterine bleeding. Structural lesions such as fibroids or polyps are uncommon at this age and have been excluded here by normal imaging.",
    difficulty: "medium",
  },
  {
    id: "inicet-2021-obstetrics-gynaecology-006",
    examId: "inicet",
    year: 2021,
    subjectId: "obstetrics-gynaecology",
    topicId: "obstetrics-gynaecology--infertility",
    stem: "In the evaluation of a couple with infertility, which single test provides the earliest and most cost-effective assessment of the female partner's ovarian reserve?",
    options: [
      { id: "inicet-2021-obstetrics-gynaecology-006-a", text: "Day 3 serum FSH and anti-Müllerian hormone (AMH) levels" },
      { id: "inicet-2021-obstetrics-gynaecology-006-b", text: "Hysterosalpingography" },
      { id: "inicet-2021-obstetrics-gynaecology-006-c", text: "Semen analysis of the male partner" },
      { id: "inicet-2021-obstetrics-gynaecology-006-d", text: "Diagnostic laparoscopy for tubal patency" },
    ],
    correctOptionId: "inicet-2021-obstetrics-gynaecology-006-a",
    explanation:
      "Day 3 FSH combined with AMH gives an inexpensive, early indication of ovarian reserve, with a rising FSH or a low AMH suggesting diminished reserve before overt changes in cycle length occur. Hysterosalpingography and laparoscopy assess tubal and pelvic anatomy rather than ovarian reserve, and semen analysis evaluates the male partner separately.",
    difficulty: "easy",
  },
  {
    id: "neet-pg-2022-obstetrics-gynaecology-007",
    examId: "neet-pg",
    year: 2022,
    subjectId: "obstetrics-gynaecology",
    topicId: "obstetrics-gynaecology--antenatal-care",
    stem: "A pregnant woman at 12 weeks gestation is found to be non-immune to rubella on routine antenatal screening. What is the most appropriate management?",
    options: [
      { id: "neet-pg-2022-obstetrics-gynaecology-007-a", text: "Administer rubella (MMR) vaccination after delivery" },
      { id: "neet-pg-2022-obstetrics-gynaecology-007-b", text: "Give the MMR vaccine immediately during pregnancy" },
      { id: "neet-pg-2022-obstetrics-gynaecology-007-c", text: "Advise termination of pregnancy" },
      { id: "neet-pg-2022-obstetrics-gynaecology-007-d", text: "Administer rubella immunoglobulin now" },
    ],
    correctOptionId: "neet-pg-2022-obstetrics-gynaecology-007-a",
    explanation:
      "MMR is a live-attenuated vaccine and is contraindicated during pregnancy because of a theoretical risk to the fetus, so a non-immune woman identified antenatally should instead be counseled to avoid rubella exposure and receive the vaccine postpartum. Termination is not indicated based on non-immune status alone in the absence of confirmed maternal infection.",
    difficulty: "medium",
  },
  {
    id: "fmge-2023-obstetrics-gynaecology-008",
    examId: "fmge",
    year: 2023,
    subjectId: "obstetrics-gynaecology",
    topicId: "obstetrics-gynaecology--labour-delivery",
    stem: "During active management of the third stage of labour, oxytocin is administered to reduce blood loss. Which mechanism underlies its efficacy in preventing postpartum hemorrhage?",
    options: [
      {
        id: "fmge-2023-obstetrics-gynaecology-008-a",
        text: "Sustained tonic contraction of the myometrium that compresses the spiral arterioles",
      },
      { id: "fmge-2023-obstetrics-gynaecology-008-b", text: "Direct vasoconstriction of the uterine arteries" },
      {
        id: "fmge-2023-obstetrics-gynaecology-008-c",
        text: "Promotion of clot formation at the placental site through platelet aggregation",
      },
      { id: "fmge-2023-obstetrics-gynaecology-008-d", text: "Inhibition of prostaglandin synthesis in the decidua" },
    ],
    correctOptionId: "fmge-2023-obstetrics-gynaecology-008-a",
    explanation:
      "Oxytocin causes sustained, tonic contraction of the myometrium, which mechanically compresses the spiral arterioles running through the interlacing muscle fibers, functioning as 'living ligatures' that limit blood loss after placental separation. This mechanical hemostasis is the primary basis for its use in active management of the third stage of labour.",
    difficulty: "hard",
  },
  {
    id: "inicet-2024-obstetrics-gynaecology-009",
    examId: "inicet",
    year: 2024,
    subjectId: "obstetrics-gynaecology",
    topicId: "obstetrics-gynaecology--high-risk-pregnancy",
    stem: "A primigravida at 30 weeks gestation is diagnosed with severe preeclampsia, with a blood pressure of 170/110 mmHg, significant proteinuria, and a persistent headache. Which antihypertensive agent is preferred for acute control of her severe hypertension?",
    options: [
      { id: "inicet-2024-obstetrics-gynaecology-009-a", text: "Intravenous labetalol" },
      { id: "inicet-2024-obstetrics-gynaecology-009-b", text: "An angiotensin-converting enzyme inhibitor" },
      { id: "inicet-2024-obstetrics-gynaecology-009-c", text: "Atenolol" },
      { id: "inicet-2024-obstetrics-gynaecology-009-d", text: "An angiotensin receptor blocker" },
    ],
    correctOptionId: "inicet-2024-obstetrics-gynaecology-009-a",
    explanation:
      "Intravenous labetalol is a preferred agent for acute control of severe hypertension in pregnancy because it rapidly lowers blood pressure with a favorable fetal safety profile. ACE inhibitors and ARBs are contraindicated in pregnancy due to fetotoxicity, and atenolol is avoided because of its association with fetal growth restriction.",
    explanationFigure: {
      kind: "chart",
      caption:
        "Dose-response chart comparing the fall in blood pressure over time with intravenous labetalol versus oral nifedipine in the acute treatment of severe preeclampsia.",
    },
    difficulty: "medium",
  },
  {
    id: "neet-pg-2025-obstetrics-gynaecology-010",
    examId: "neet-pg",
    year: 2025,
    subjectId: "obstetrics-gynaecology",
    topicId: "obstetrics-gynaecology--gynaecological-oncology",
    stem: "Which of the following is the strongest identified risk factor for the development of epithelial ovarian cancer?",
    options: [
      { id: "neet-pg-2025-obstetrics-gynaecology-010-a", text: "Germline BRCA1 or BRCA2 mutation" },
      { id: "neet-pg-2025-obstetrics-gynaecology-010-b", text: "Multiparity" },
      { id: "neet-pg-2025-obstetrics-gynaecology-010-c", text: "Long-term use of combined oral contraceptives" },
      { id: "neet-pg-2025-obstetrics-gynaecology-010-d", text: "Early menarche in isolation" },
    ],
    correctOptionId: "neet-pg-2025-obstetrics-gynaecology-010-a",
    explanation:
      "Germline BRCA1 and BRCA2 mutations confer the highest lifetime risk of epithelial ovarian cancer, with BRCA1 carriers facing a substantially elevated risk that underlies recommendations for risk-reducing salpingo-oophorectomy after childbearing is complete. Multiparity and combined oral contraceptive use are, by contrast, protective by reducing lifetime ovulatory cycles.",
    difficulty: "medium",
  },
  {
    id: "fmge-2021-obstetrics-gynaecology-011",
    examId: "fmge",
    year: 2021,
    subjectId: "obstetrics-gynaecology",
    topicId: "obstetrics-gynaecology--menstrual-disorders",
    stem: "A 45-year-old woman presents with cyclical pelvic pain, worsening dysmenorrhea, and an enlarged, globular, tender uterus on bimanual examination. Transvaginal ultrasound shows a poorly defined junctional zone with scattered myometrial cysts. What is the most likely diagnosis?",
    options: [
      { id: "fmge-2021-obstetrics-gynaecology-011-a", text: "Adenomyosis" },
      { id: "fmge-2021-obstetrics-gynaecology-011-b", text: "Uterine leiomyoma" },
      { id: "fmge-2021-obstetrics-gynaecology-011-c", text: "Endometrial carcinoma" },
      { id: "fmge-2021-obstetrics-gynaecology-011-d", text: "Chronic pelvic inflammatory disease" },
    ],
    correctOptionId: "fmge-2021-obstetrics-gynaecology-011-a",
    explanation:
      "Adenomyosis results from ectopic endometrial glands and stroma within the myometrium, producing a diffusely enlarged, globular, tender uterus with a thickened, ill-defined junctional zone and small myometrial cysts on ultrasound. This distinguishes it from leiomyoma, which typically presents as discrete, well-circumscribed masses rather than diffuse uterine enlargement.",
    difficulty: "medium",
  },
  {
    id: "inicet-2022-obstetrics-gynaecology-012",
    examId: "inicet",
    year: 2022,
    subjectId: "obstetrics-gynaecology",
    topicId: "obstetrics-gynaecology--infertility",
    stem: "A 30-year-old woman with infertility is diagnosed with polycystic ovary syndrome. Which agent is now recommended as first-line pharmacological therapy for ovulation induction, based on evidence of superior live birth rates over previously favored clomiphene citrate?",
    options: [
      { id: "inicet-2022-obstetrics-gynaecology-012-a", text: "Letrozole" },
      { id: "inicet-2022-obstetrics-gynaecology-012-b", text: "Clomiphene citrate" },
      { id: "inicet-2022-obstetrics-gynaecology-012-c", text: "Metformin monotherapy" },
      { id: "inicet-2022-obstetrics-gynaecology-012-d", text: "A gonadotropin-releasing hormone agonist" },
    ],
    correctOptionId: "inicet-2022-obstetrics-gynaecology-012-a",
    explanation:
      "Letrozole, an aromatase inhibitor, reduces peripheral estrogen synthesis and thereby diminishes negative feedback on the hypothalamic-pituitary axis, raising FSH and promoting monofollicular ovulation; large trials have shown higher live birth rates with letrozole than clomiphene citrate in women with PCOS. Metformin alone is less effective for ovulation induction and is typically reserved for insulin resistance or used as an adjunct.",
    difficulty: "hard",
  },
  {
    id: "neet-pg-2023-obstetrics-gynaecology-013",
    examId: "neet-pg",
    year: 2023,
    subjectId: "obstetrics-gynaecology",
    topicId: "obstetrics-gynaecology--antenatal-care",
    stem: "At what gestational age is the oral glucose tolerance test typically performed to screen for gestational diabetes mellitus in a low-risk pregnant woman?",
    options: [
      { id: "neet-pg-2023-obstetrics-gynaecology-013-a", text: "24 to 28 weeks" },
      { id: "neet-pg-2023-obstetrics-gynaecology-013-b", text: "8 to 10 weeks" },
      { id: "neet-pg-2023-obstetrics-gynaecology-013-c", text: "36 to 38 weeks" },
      { id: "neet-pg-2023-obstetrics-gynaecology-013-d", text: "16 to 18 weeks" },
    ],
    correctOptionId: "neet-pg-2023-obstetrics-gynaecology-013-a",
    explanation:
      "Universal screening for gestational diabetes is recommended at 24-28 weeks gestation, the period when placental hormones such as human placental lactogen produce peak physiological insulin resistance, making glucose intolerance most detectable. Women with high-risk features may be screened earlier, but routine low-risk screening is timed to this window.",
    difficulty: "easy",
  },
  {
    id: "fmge-2024-obstetrics-gynaecology-014",
    examId: "fmge",
    year: 2024,
    subjectId: "obstetrics-gynaecology",
    topicId: "obstetrics-gynaecology--labour-delivery",
    stem: "A woman in active labour has a partogram showing that the cervical dilatation curve has crossed the alert line but has not yet reached the action line. What does this finding indicate?",
    options: [
      {
        id: "fmge-2024-obstetrics-gynaecology-014-a",
        text: "Slow but potentially progressing labour that requires closer monitoring or referral",
      },
      { id: "fmge-2024-obstetrics-gynaecology-014-b", text: "Entirely normal labour progress requiring no action" },
      { id: "fmge-2024-obstetrics-gynaecology-014-c", text: "Obstructed labour requiring immediate cesarean section" },
      {
        id: "fmge-2024-obstetrics-gynaecology-014-d",
        text: "Failure to progress mandating immediate oxytocin augmentation",
      },
    ],
    correctOptionId: "fmge-2024-obstetrics-gynaecology-014-a",
    explanation:
      "Crossing the alert line on the partograph signals slower-than-expected cervical dilatation and prompts closer observation or timely referral to a facility capable of intervention, but it is not itself an indication for cesarean section. Only crossing the action line, which reflects a more significant delay, typically prompts active intervention such as augmentation or operative delivery.",
    difficulty: "medium",
  },
  {
    id: "inicet-2025-obstetrics-gynaecology-015",
    examId: "inicet",
    year: 2025,
    subjectId: "obstetrics-gynaecology",
    topicId: "obstetrics-gynaecology--high-risk-pregnancy",
    stem: "A 34-year-old woman at 32 weeks gestation presents with painless vaginal bleeding. A transvaginal ultrasound is performed. Based on the placental location shown, which mode of delivery is most appropriate?",
    stemFigure: {
      kind: "diagram",
      caption:
        "Schematic transvaginal ultrasound diagram showing placental tissue completely covering the internal cervical os, consistent with complete placenta previa.",
    },
    options: [
      { id: "inicet-2025-obstetrics-gynaecology-015-a", text: "Cesarean section" },
      { id: "inicet-2025-obstetrics-gynaecology-015-b", text: "Vaginal delivery with continuous fetal monitoring" },
      { id: "inicet-2025-obstetrics-gynaecology-015-c", text: "Induction of labour with oxytocin" },
      { id: "inicet-2025-obstetrics-gynaecology-015-d", text: "Expectant management until spontaneous labour" },
    ],
    correctOptionId: "inicet-2025-obstetrics-gynaecology-015-a",
    explanation:
      "When the placenta completely covers the internal os, vaginal delivery risks catastrophic hemorrhage as the cervix effaces and dilates, so cesarean section is mandatory regardless of gestational age at the time of definitive delivery. Attempts at vaginal delivery or labour induction in complete placenta previa are contraindicated due to this bleeding risk.",
    difficulty: "medium",
  },
  {
    id: "neet-pg-2025-obstetrics-gynaecology-016",
    examId: "neet-pg",
    year: 2025,
    subjectId: "obstetrics-gynaecology",
    topicId: "obstetrics-gynaecology--gynaecological-oncology",
    stem: "A 62-year-old woman presents with vulval pruritus and a chronic, white, thickened, well-demarcated plaque on the labia majora. Biopsy reveals lichen sclerosus with associated differentiated vulval intraepithelial neoplasia. This lesion carries an increased risk of progression to which malignancy?",
    options: [
      { id: "neet-pg-2025-obstetrics-gynaecology-016-a", text: "Vulval squamous cell carcinoma" },
      { id: "neet-pg-2025-obstetrics-gynaecology-016-b", text: "Vulval melanoma" },
      { id: "neet-pg-2025-obstetrics-gynaecology-016-c", text: "Extramammary Paget disease" },
      { id: "neet-pg-2025-obstetrics-gynaecology-016-d", text: "Basal cell carcinoma" },
    ],
    correctOptionId: "neet-pg-2025-obstetrics-gynaecology-016-a",
    explanation:
      "Differentiated vulval intraepithelial neoplasia arises in a background of lichen sclerosus and carries a well-established risk of progression to keratinizing vulval squamous cell carcinoma, unlike the usual-type VIN associated with high-risk HPV infection. This is why long-standing lichen sclerosus warrants regular follow-up and biopsy of any new thickened or ulcerated area.",
    difficulty: "hard",
  },
];
