import type { Question } from "@/types";

export const BIOCHEMISTRY_QUESTIONS: Question[] = [
  {
    id: "neet-pg-2021-biochemistry-001",
    examId: "neet-pg",
    year: 2021,
    subjectId: "biochemistry",
    topicId: "biochemistry--enzymology",
    stem: "A competitive inhibitor of an enzyme characteristically produces which change in Michaelis-Menten kinetic parameters?",
    stemFigure: {
      kind: "chart",
      caption:
        "Lineweaver-Burk double reciprocal plot showing two lines intersecting on the y-axis, one for the enzyme alone and a second, less steep in x-intercept, obtained in the presence of an inhibitor, indicating an unchanged Vmax with an increased apparent Km.",
    },
    options: [
      { id: "neet-pg-2021-biochemistry-001-a", text: "Increased Km with unchanged Vmax" },
      { id: "neet-pg-2021-biochemistry-001-b", text: "Decreased Km with unchanged Vmax" },
      { id: "neet-pg-2021-biochemistry-001-c", text: "Unchanged Km with decreased Vmax" },
      { id: "neet-pg-2021-biochemistry-001-d", text: "Decreased Km with decreased Vmax" },
    ],
    correctOptionId: "neet-pg-2021-biochemistry-001-a",
    explanation:
      "A competitive inhibitor binds reversibly to the active site and competes with substrate, so it increases the apparent Km, reflecting reduced substrate affinity, while Vmax remains unchanged because sufficiently high substrate concentration can still outcompete the inhibitor. This is in contrast to a noncompetitive inhibitor, which lowers Vmax without altering Km.",
    difficulty: "medium",
  },
  {
    id: "fmge-2022-biochemistry-002",
    examId: "fmge",
    year: 2022,
    subjectId: "biochemistry",
    topicId: "biochemistry--carbohydrate-metabolism",
    stem: "Which enzyme catalyzes the rate-limiting step of glycolysis?",
    options: [
      { id: "fmge-2022-biochemistry-002-a", text: "Phosphofructokinase-1" },
      { id: "fmge-2022-biochemistry-002-b", text: "Hexokinase" },
      { id: "fmge-2022-biochemistry-002-c", text: "Pyruvate kinase" },
      { id: "fmge-2022-biochemistry-002-d", text: "Aldolase" },
    ],
    correctOptionId: "fmge-2022-biochemistry-002-a",
    explanation:
      "Phosphofructokinase-1 catalyzes the committed and rate-limiting step of glycolysis, the conversion of fructose-6-phosphate to fructose-1,6-bisphosphate. It is allosterically inhibited by ATP and citrate and stimulated by AMP and fructose-2,6-bisphosphate, allowing glycolytic flux to respond to the energy state of the cell.",
    difficulty: "easy",
  },
  {
    id: "inicet-2023-biochemistry-003",
    examId: "inicet",
    year: 2023,
    subjectId: "biochemistry",
    topicId: "biochemistry--lipid-metabolism",
    stem: "Deficiency of lipoprotein lipase leads to accumulation of which lipoprotein fraction in the plasma?",
    options: [
      { id: "inicet-2023-biochemistry-003-a", text: "Chylomicrons" },
      { id: "inicet-2023-biochemistry-003-b", text: "Low-density lipoprotein" },
      { id: "inicet-2023-biochemistry-003-c", text: "High-density lipoprotein" },
      { id: "inicet-2023-biochemistry-003-d", text: "Intermediate-density lipoprotein" },
    ],
    correctOptionId: "inicet-2023-biochemistry-003-a",
    explanation:
      "Lipoprotein lipase, anchored to capillary endothelium in adipose tissue and skeletal muscle, hydrolyzes triglycerides carried in chylomicrons and very-low-density lipoproteins. Its deficiency prevents chylomicron clearance from plasma, producing severe hypertriglyceridemia with markedly elevated chylomicrons, classically presenting with eruptive xanthomas and recurrent pancreatitis.",
    difficulty: "medium",
  },
  {
    id: "neet-pg-2024-biochemistry-004",
    examId: "neet-pg",
    year: 2024,
    subjectId: "biochemistry",
    topicId: "biochemistry--molecular-biology",
    stem: "During DNA replication, synthesis of the lagging strand occurs discontinuously, producing short fragments known as:",
    options: [
      { id: "neet-pg-2024-biochemistry-004-a", text: "Okazaki fragments" },
      { id: "neet-pg-2024-biochemistry-004-b", text: "Exons" },
      { id: "neet-pg-2024-biochemistry-004-c", text: "Introns" },
      { id: "neet-pg-2024-biochemistry-004-d", text: "Anticodons" },
    ],
    correctOptionId: "neet-pg-2024-biochemistry-004-a",
    explanation:
      "Because DNA polymerase synthesizes only in the 5' to 3' direction, the lagging strand is synthesized discontinuously as short Okazaki fragments, each primed separately by RNA primase. These fragments are later joined into a continuous strand by DNA ligase after the RNA primers are removed and replaced with DNA.",
    difficulty: "easy",
  },
  {
    id: "fmge-2021-biochemistry-005",
    examId: "fmge",
    year: 2021,
    subjectId: "biochemistry",
    topicId: "biochemistry--vitamins-nutrition",
    stem: "A patient with chronic alcoholism and poor dietary intake develops confusion, ataxia, and ophthalmoplegia. Deficiency of which vitamin is most likely responsible?",
    options: [
      { id: "fmge-2021-biochemistry-005-a", text: "Thiamine (vitamin B1)" },
      { id: "fmge-2021-biochemistry-005-b", text: "Riboflavin (vitamin B2)" },
      { id: "fmge-2021-biochemistry-005-c", text: "Niacin (vitamin B3)" },
      { id: "fmge-2021-biochemistry-005-d", text: "Pyridoxine (vitamin B6)" },
    ],
    correctOptionId: "fmge-2021-biochemistry-005-a",
    explanation:
      "The triad of confusion, ataxia, and ophthalmoplegia in a patient with chronic alcohol use is classic for Wernicke encephalopathy, caused by thiamine deficiency. Thiamine pyrophosphate is a cofactor for pyruvate dehydrogenase and alpha-ketoglutarate dehydrogenase, and its lack impairs energy metabolism in neurons that are highly dependent on oxidative metabolism.",
    difficulty: "medium",
  },
  {
    id: "inicet-2025-biochemistry-006",
    examId: "inicet",
    year: 2025,
    subjectId: "biochemistry",
    topicId: "biochemistry--carbohydrate-metabolism",
    stem: "Which of the following enzymes is deficient in classic galactosemia?",
    options: [
      { id: "inicet-2025-biochemistry-006-a", text: "Galactose-1-phosphate uridyltransferase" },
      { id: "inicet-2025-biochemistry-006-b", text: "Galactokinase" },
      { id: "inicet-2025-biochemistry-006-c", text: "Aldose reductase" },
      { id: "inicet-2025-biochemistry-006-d", text: "Fructokinase" },
    ],
    correctOptionId: "inicet-2025-biochemistry-006-a",
    explanation:
      "Classic galactosemia results from deficiency of galactose-1-phosphate uridyltransferase, causing accumulation of galactose-1-phosphate that damages the liver, kidney, and brain, and presents in infancy with jaundice, hepatomegaly, and cataracts after milk feeding begins. Galactokinase deficiency is a milder variant that causes cataracts alone without the systemic toxicity.",
    difficulty: "hard",
  },
  {
    id: "neet-pg-2022-biochemistry-007",
    examId: "neet-pg",
    year: 2022,
    subjectId: "biochemistry",
    topicId: "biochemistry--enzymology",
    stem: "Serum elevation of which enzyme is most specific for acute myocardial infarction within the first 4 to 6 hours of symptom onset?",
    options: [
      { id: "neet-pg-2022-biochemistry-007-a", text: "CK-MB" },
      { id: "neet-pg-2022-biochemistry-007-b", text: "Total lactate dehydrogenase" },
      { id: "neet-pg-2022-biochemistry-007-c", text: "Alkaline phosphatase" },
      { id: "neet-pg-2022-biochemistry-007-d", text: "Alanine aminotransferase" },
    ],
    correctOptionId: "neet-pg-2022-biochemistry-007-a",
    explanation:
      "CK-MB rises within 4 to 6 hours of myocardial infarction, peaks at around 24 hours, and returns to baseline by 48 to 72 hours, making it useful for detecting early infarction or reinfarction. Cardiac troponins have largely replaced it as the preferred marker due to greater sensitivity and specificity, but CK-MB remains a classic teaching point for early cardiac enzyme elevation.",
    difficulty: "medium",
  },
];
