import type { Question } from "@/types";

export const PHARMACOLOGY_QUESTIONS: Question[] = [
  {
    id: "neet-pg-2021-pharmacology-001",
    examId: "neet-pg",
    year: 2021,
    subjectId: "pharmacology",
    topicId: "pharmacology--autonomic-pharmacology",
    stem: "A patient with myasthenia gravis is treated with pyridostigmine. Which mechanism of action underlies its therapeutic benefit?",
    options: [
      {
        id: "neet-pg-2021-pharmacology-001-a",
        text: "Reversible inhibition of acetylcholinesterase, increasing acetylcholine availability at the neuromuscular junction",
      },
      { id: "neet-pg-2021-pharmacology-001-b", text: "Direct agonism at nicotinic receptors on skeletal muscle" },
      { id: "neet-pg-2021-pharmacology-001-c", text: "Irreversible inhibition of acetylcholinesterase" },
      { id: "neet-pg-2021-pharmacology-001-d", text: "Blockade of muscarinic receptors at the neuromuscular junction" },
    ],
    correctOptionId: "neet-pg-2021-pharmacology-001-a",
    explanation:
      "Pyridostigmine reversibly inhibits acetylcholinesterase, prolonging the presence of acetylcholine in the neuromuscular junction and thereby improving neuromuscular transmission in myasthenia gravis, where autoantibodies reduce functional nicotinic receptor density. Its reversible binding gives a favorable safety margin compared with irreversible organophosphate-type inhibitors, which are used only as pesticides or nerve agents, not therapeutically.",
    difficulty: "medium",
  },
  {
    id: "fmge-2022-pharmacology-002",
    examId: "fmge",
    year: 2022,
    subjectId: "pharmacology",
    topicId: "pharmacology--cardiovascular-pharmacology",
    stem: "Which class of antihypertensive drugs is most likely to cause a dry, persistent cough as an adverse effect?",
    options: [
      { id: "fmge-2022-pharmacology-002-a", text: "Angiotensin-converting enzyme inhibitors" },
      { id: "fmge-2022-pharmacology-002-b", text: "Calcium channel blockers" },
      { id: "fmge-2022-pharmacology-002-c", text: "Thiazide diuretics" },
      { id: "fmge-2022-pharmacology-002-d", text: "Beta-blockers" },
    ],
    correctOptionId: "fmge-2022-pharmacology-002-a",
    explanation:
      "ACE inhibitors prevent the breakdown of bradykinin in addition to blocking angiotensin II formation, and the resulting accumulation of bradykinin in the airways is thought to cause the characteristic dry, persistent cough seen in a notable proportion of patients. Switching to an angiotensin receptor blocker, which does not affect bradykinin metabolism, typically resolves this adverse effect.",
    difficulty: "easy",
  },
  {
    id: "inicet-2023-pharmacology-003",
    examId: "inicet",
    year: 2023,
    subjectId: "pharmacology",
    topicId: "pharmacology--antimicrobial-pharmacology",
    stem: "A patient being treated with isoniazid for tuberculosis develops peripheral neuropathy. Which mechanism best explains this adverse effect, and what is co-administered to prevent it?",
    options: [
      {
        id: "inicet-2023-pharmacology-003-a",
        text: "Isoniazid increases pyridoxine excretion and interferes with its metabolism, so pyridoxine is given prophylactically",
      },
      {
        id: "inicet-2023-pharmacology-003-b",
        text: "Isoniazid directly damages myelin sheaths, and no preventive therapy exists",
      },
      {
        id: "inicet-2023-pharmacology-003-c",
        text: "Isoniazid causes vitamin B12 deficiency, corrected with B12 supplementation",
      },
      {
        id: "inicet-2023-pharmacology-003-d",
        text: "Isoniazid depletes folate stores, which is prevented with folinic acid",
      },
    ],
    correctOptionId: "inicet-2023-pharmacology-003-a",
    explanation:
      "Isoniazid structurally resembles pyridoxine and interferes with its activation and increases its renal excretion, leading to a functional pyridoxine deficiency that manifests as peripheral neuropathy, particularly in malnourished or slow acetylator patients. Prophylactic pyridoxine supplementation is therefore routinely given alongside isoniazid to prevent this complication.",
    difficulty: "medium",
  },
  {
    id: "neet-pg-2024-pharmacology-004",
    examId: "neet-pg",
    year: 2024,
    subjectId: "pharmacology",
    topicId: "pharmacology--cns-pharmacology",
    stem: "A patient with Parkinson disease is started on levodopa combined with carbidopa, as illustrated. Which best explains the rationale for combining these two drugs?",
    stemFigure: {
      kind: "diagram",
      caption:
        "Pathway diagram showing peripheral conversion of levodopa to dopamine by dopa decarboxylase, and how carbidopa blocks this conversion outside the central nervous system to spare levodopa for crossing into the brain.",
    },
    options: [
      {
        id: "neet-pg-2024-pharmacology-004-a",
        text: "Carbidopa inhibits peripheral dopa decarboxylase without crossing the blood-brain barrier, increasing central levodopa availability and reducing peripheral side effects",
      },
      {
        id: "neet-pg-2024-pharmacology-004-b",
        text: "Carbidopa directly enhances central dopamine receptor sensitivity",
      },
      {
        id: "neet-pg-2024-pharmacology-004-c",
        text: "Carbidopa crosses into the brain and is itself converted to dopamine",
      },
      {
        id: "neet-pg-2024-pharmacology-004-d",
        text: "Carbidopa centrally inhibits monoamine oxidase-B to prolong dopamine action",
      },
    ],
    correctOptionId: "neet-pg-2024-pharmacology-004-a",
    explanation:
      "Carbidopa inhibits peripheral dopa decarboxylase but does not cross the blood-brain barrier itself, so it prevents premature peripheral conversion of levodopa to dopamine, allowing more levodopa to reach the central nervous system while reducing peripheral adverse effects such as nausea and hypotension. This combination allows a substantially lower dose of levodopa to be used for equivalent central effect.",
    difficulty: "hard",
  },
  {
    id: "fmge-2025-pharmacology-005",
    examId: "fmge",
    year: 2025,
    subjectId: "pharmacology",
    topicId: "pharmacology--endocrine-pharmacology",
    stem: "A patient with type 2 diabetes mellitus started on metformin develops nausea and mild lactic acidosis. Which mechanism underlies metformin's primary glucose-lowering action?",
    options: [
      {
        id: "fmge-2025-pharmacology-005-a",
        text: "Decreased hepatic gluconeogenesis and improved peripheral insulin sensitivity",
      },
      { id: "fmge-2025-pharmacology-005-b", text: "Stimulation of pancreatic beta cells to increase insulin secretion" },
      { id: "fmge-2025-pharmacology-005-c", text: "Inhibition of intestinal alpha-glucosidase enzymes" },
      { id: "fmge-2025-pharmacology-005-d", text: "Increased renal glucose excretion via SGLT2 inhibition" },
    ],
    correctOptionId: "fmge-2025-pharmacology-005-a",
    explanation:
      "Metformin's principal action is to reduce hepatic gluconeogenesis, mediated in part through activation of AMP-activated protein kinase, while also improving peripheral tissue sensitivity to insulin, without directly stimulating insulin secretion. This mechanism explains its low intrinsic risk of hypoglycemia, in contrast to insulin secretagogues such as sulfonylureas.",
    difficulty: "medium",
  },
  {
    id: "inicet-2021-pharmacology-006",
    examId: "inicet",
    year: 2021,
    subjectId: "pharmacology",
    topicId: "pharmacology--chemotherapy",
    stem: "Which anticancer drug is classically associated with dose-limiting cardiotoxicity presenting as dilated cardiomyopathy?",
    options: [
      { id: "inicet-2021-pharmacology-006-a", text: "Doxorubicin" },
      { id: "inicet-2021-pharmacology-006-b", text: "Vincristine" },
      { id: "inicet-2021-pharmacology-006-c", text: "Bleomycin" },
      { id: "inicet-2021-pharmacology-006-d", text: "Cisplatin" },
    ],
    correctOptionId: "inicet-2021-pharmacology-006-a",
    explanation:
      "Doxorubicin, an anthracycline, generates reactive oxygen species and interferes with cardiac myocyte iron handling, producing a cumulative, dose-dependent cardiotoxicity that can progress to irreversible dilated cardiomyopathy. Lifetime cumulative dosing limits and monitoring of left ventricular ejection fraction are used to reduce this risk, unlike bleomycin, which is instead notable for pulmonary fibrosis.",
    difficulty: "easy",
  },
  {
    id: "neet-pg-2022-pharmacology-007",
    examId: "neet-pg",
    year: 2022,
    subjectId: "pharmacology",
    topicId: "pharmacology--autonomic-pharmacology",
    stem: "A patient in anaphylactic shock is given intramuscular epinephrine. Which combination of receptor actions makes epinephrine the drug of choice in this emergency?",
    options: [
      {
        id: "neet-pg-2022-pharmacology-007-a",
        text: "Alpha-1-mediated vasoconstriction combined with beta-2-mediated bronchodilation",
      },
      {
        id: "neet-pg-2022-pharmacology-007-b",
        text: "Alpha-2-mediated presynaptic inhibition combined with beta-1-mediated bradycardia",
      },
      { id: "neet-pg-2022-pharmacology-007-c", text: "Pure beta-1 agonism causing increased cardiac output alone" },
      { id: "neet-pg-2022-pharmacology-007-d", text: "Pure alpha-1 agonism without any beta receptor activity" },
    ],
    correctOptionId: "neet-pg-2022-pharmacology-007-a",
    explanation:
      "Epinephrine's alpha-1 agonism reverses the vasodilation and hypotension of anaphylaxis, while its beta-2 agonism relieves bronchospasm and reduces further mediator release from mast cells, together addressing the two most life-threatening features of the reaction. Its additional beta-1 effect supports cardiac output, making it uniquely suited among adrenergic agents for this emergency.",
    difficulty: "medium",
  },
  {
    id: "fmge-2023-pharmacology-008",
    examId: "fmge",
    year: 2023,
    subjectId: "pharmacology",
    topicId: "pharmacology--cardiovascular-pharmacology",
    stem: "A patient with chronic heart failure with reduced ejection fraction is started on sacubitril-valsartan. Which mechanism explains the added benefit of sacubitril over valsartan alone?",
    options: [
      {
        id: "fmge-2023-pharmacology-008-a",
        text: "Sacubitril inhibits neprilysin, preventing degradation of natriuretic peptides and enhancing their vasodilatory and natriuretic effects",
      },
      {
        id: "fmge-2023-pharmacology-008-b",
        text: "Sacubitril directly blocks angiotensin II receptors more potently than valsartan",
      },
      { id: "fmge-2023-pharmacology-008-c", text: "Sacubitril inhibits aldosterone synthesis in the adrenal cortex" },
      { id: "fmge-2023-pharmacology-008-d", text: "Sacubitril acts as a direct renin inhibitor" },
    ],
    correctOptionId: "fmge-2023-pharmacology-008-a",
    explanation:
      "Sacubitril inhibits neprilysin, the enzyme responsible for degrading natriuretic peptides, thereby prolonging their beneficial vasodilatory, natriuretic, and anti-remodeling effects, while valsartan independently blocks the deleterious effects of angiotensin II. This combined angiotensin receptor-neprilysin inhibition has shown superior outcomes compared with ACE inhibition alone in landmark heart failure trials.",
    difficulty: "hard",
  },
  {
    id: "inicet-2024-pharmacology-009",
    examId: "inicet",
    year: 2024,
    subjectId: "pharmacology",
    topicId: "pharmacology--antimicrobial-pharmacology",
    stem: "A hospitalized patient develops a urinary tract infection caused by an extended-spectrum beta-lactamase (ESBL) producing Escherichia coli. Which class of antibiotics remains most reliably effective against such organisms?",
    options: [
      { id: "inicet-2024-pharmacology-009-a", text: "Carbapenems" },
      { id: "inicet-2024-pharmacology-009-b", text: "Third-generation cephalosporins" },
      { id: "inicet-2024-pharmacology-009-c", text: "Aminopenicillins" },
      { id: "inicet-2024-pharmacology-009-d", text: "Fluoroquinolones alone" },
    ],
    correctOptionId: "inicet-2024-pharmacology-009-a",
    explanation:
      "ESBL enzymes hydrolyze the beta-lactam ring of penicillins and most cephalosporins, rendering these classes unreliable, whereas the distinct structural configuration of carbapenems confers resistance to hydrolysis by these enzymes, making carbapenems the preferred agents for serious ESBL-producing infections. Fluoroquinolone resistance also commonly co-exists with ESBL production, further limiting its reliability as an alternative.",
    explanationFigure: {
      kind: "diagram",
      caption:
        "Diagram showing an ESBL enzyme hydrolyzing the beta-lactam ring of cephalosporins and penicillins, while a carbapenem molecule resists this hydrolysis due to its distinct ring structure.",
    },
    difficulty: "medium",
  },
  {
    id: "neet-pg-2025-pharmacology-010",
    examId: "neet-pg",
    year: 2025,
    subjectId: "pharmacology",
    topicId: "pharmacology--cns-pharmacology",
    stem: "A patient on long-term therapy with a typical antipsychotic develops fine, worm-like involuntary movements of the tongue and repetitive lip smacking after several years of treatment. What is the most likely diagnosis and its mechanism?",
    options: [
      {
        id: "neet-pg-2025-pharmacology-010-a",
        text: "Tardive dyskinesia, due to dopamine receptor supersensitivity from chronic receptor blockade",
      },
      {
        id: "neet-pg-2025-pharmacology-010-b",
        text: "Acute dystonia, due to acute dopamine receptor blockade",
      },
      {
        id: "neet-pg-2025-pharmacology-010-c",
        text: "Neuroleptic malignant syndrome, due to sudden dopamine blockade",
      },
      { id: "neet-pg-2025-pharmacology-010-d", text: "Akathisia, due to excess dopaminergic activity" },
    ],
    correctOptionId: "neet-pg-2025-pharmacology-010-a",
    explanation:
      "Tardive dyskinesia develops after months to years of chronic dopamine receptor blockade, thought to result from compensatory upregulation and supersensitivity of striatal dopamine receptors, producing the characteristic orofacial and lingual choreoathetoid movements described. It is often persistent even after the offending drug is withdrawn, unlike acute dystonia, which occurs within hours to days of starting therapy.",
    difficulty: "hard",
  },
  {
    id: "fmge-2021-pharmacology-011",
    examId: "fmge",
    year: 2021,
    subjectId: "pharmacology",
    topicId: "pharmacology--endocrine-pharmacology",
    stem: "A patient with Graves disease is treated with propylthiouracil during the first trimester of pregnancy. Which mechanism explains its therapeutic action?",
    options: [
      {
        id: "fmge-2021-pharmacology-011-a",
        text: "Inhibition of thyroid peroxidase-mediated iodination and coupling, along with peripheral inhibition of T4-to-T3 conversion",
      },
      {
        id: "fmge-2021-pharmacology-011-b",
        text: "Blockade of thyroid-stimulating hormone receptors on the thyroid gland",
      },
      {
        id: "fmge-2021-pharmacology-011-c",
        text: "Destruction of thyroid follicular cells through radioactive accumulation",
      },
      { id: "fmge-2021-pharmacology-011-d", text: "Inhibition of iodide trapping by the sodium-iodide symporter" },
    ],
    correctOptionId: "fmge-2021-pharmacology-011-a",
    explanation:
      "Propylthiouracil inhibits thyroid peroxidase, blocking the oxidation, iodination, and coupling steps of thyroid hormone synthesis, and uniquely among thionamides also inhibits peripheral conversion of T4 to the more active T3. This peripheral action, along with lower placental transfer, makes it the preferred agent over methimazole specifically during the first trimester of pregnancy.",
    difficulty: "medium",
  },
  {
    id: "inicet-2022-pharmacology-012",
    examId: "inicet",
    year: 2022,
    subjectId: "pharmacology",
    topicId: "pharmacology--chemotherapy",
    stem: "A patient receiving high-dose methotrexate for choriocarcinoma develops mucositis and myelosuppression. Which agent is used to rescue normal cells from methotrexate toxicity, and by what mechanism?",
    options: [
      {
        id: "inicet-2022-pharmacology-012-a",
        text: "Leucovorin (folinic acid), which bypasses the blocked dihydrofolate reductase step to replenish reduced folate",
      },
      { id: "inicet-2022-pharmacology-012-b", text: "Vitamin B12, which restores folate synthesis pathways" },
      {
        id: "inicet-2022-pharmacology-012-c",
        text: "Pyridoxine, which competitively displaces methotrexate from dihydrofolate reductase",
      },
      { id: "inicet-2022-pharmacology-012-d", text: "Thiamine, which replenishes one-carbon transfer reactions" },
    ],
    correctOptionId: "inicet-2022-pharmacology-012-a",
    explanation:
      "Methotrexate inhibits dihydrofolate reductase, blocking regeneration of tetrahydrofolate needed for purine and thymidylate synthesis; leucovorin provides a reduced folate that bypasses this blocked step, rescuing normal proliferating cells while the tumor, which is more dependent on folate metabolism, remains relatively more affected. This 'leucovorin rescue' strategy allows the use of higher, more effective doses of methotrexate with an acceptable toxicity profile.",
    difficulty: "hard",
  },
  {
    id: "neet-pg-2023-pharmacology-013",
    examId: "neet-pg",
    year: 2023,
    subjectId: "pharmacology",
    topicId: "pharmacology--autonomic-pharmacology",
    stem: "Atropine is used in the treatment of organophosphate poisoning. Which receptor does it block to reverse the life-threatening features of this toxicity?",
    options: [
      { id: "neet-pg-2023-pharmacology-013-a", text: "Muscarinic acetylcholine receptors" },
      { id: "neet-pg-2023-pharmacology-013-b", text: "Nicotinic acetylcholine receptors at the neuromuscular junction" },
      { id: "neet-pg-2023-pharmacology-013-c", text: "Beta-adrenergic receptors" },
      { id: "neet-pg-2023-pharmacology-013-d", text: "Alpha-adrenergic receptors" },
    ],
    correctOptionId: "neet-pg-2023-pharmacology-013-a",
    explanation:
      "Organophosphates inhibit acetylcholinesterase, causing excess acetylcholine to accumulate at both muscarinic and nicotinic sites, but atropine competitively blocks only the muscarinic receptors, reversing the life-threatening bradycardia, bronchorrhea, and bronchospasm. It has no effect on the nicotinic-mediated muscle weakness and fasciculations, which instead require an oxime such as pralidoxime to reactivate the enzyme.",
    difficulty: "easy",
  },
  {
    id: "fmge-2024-pharmacology-014",
    examId: "fmge",
    year: 2024,
    subjectId: "pharmacology",
    topicId: "pharmacology--cardiovascular-pharmacology",
    stem: "A patient with stable angina is prescribed sublingual glyceryl trinitrate. Which mechanism best accounts for its rapid relief of anginal pain?",
    options: [
      {
        id: "fmge-2024-pharmacology-014-a",
        text: "Release of nitric oxide causing venodilation, which reduces preload and myocardial oxygen demand",
      },
      {
        id: "fmge-2024-pharmacology-014-b",
        text: "Direct coronary artery vasodilation through calcium channel blockade",
      },
      {
        id: "fmge-2024-pharmacology-014-c",
        text: "Beta-1 receptor blockade reducing heart rate and contractility",
      },
      { id: "fmge-2024-pharmacology-014-d", text: "Inhibition of platelet aggregation preventing thrombus formation" },
    ],
    correctOptionId: "fmge-2024-pharmacology-014-a",
    explanation:
      "Glyceryl trinitrate is metabolized to release nitric oxide, which activates guanylate cyclase in vascular smooth muscle to increase cyclic GMP and produce predominantly venous dilation, reducing venous return, preload, and consequently myocardial oxygen demand. This rapid preload reduction, rather than a primary effect on coronary artery diameter or platelet function, is the main basis for its quick relief of anginal pain.",
    difficulty: "medium",
  },
  {
    id: "inicet-2025-pharmacology-015",
    examId: "inicet",
    year: 2025,
    subjectId: "pharmacology",
    topicId: "pharmacology--antimicrobial-pharmacology",
    stem: "A patient receiving a rapid intravenous infusion of vancomycin develops flushing and an erythematous rash over the face, neck, and upper trunk along with pruritus, as shown. Which mechanism best explains this reaction?",
    stemFigure: {
      kind: "clinical-photo",
      caption:
        "Photograph showing erythematous, blotchy flushing over the face, neck, and upper trunk occurring during a rapid vancomycin infusion, consistent with red man syndrome.",
    },
    options: [
      {
        id: "inicet-2025-pharmacology-015-a",
        text: "Non-immunologic mast cell degranulation causing histamine release (red man syndrome)",
      },
      { id: "inicet-2025-pharmacology-015-b", text: "IgE-mediated type I hypersensitivity to vancomycin" },
      { id: "inicet-2025-pharmacology-015-c", text: "Immune complex-mediated type III hypersensitivity reaction" },
      { id: "inicet-2025-pharmacology-015-d", text: "A direct nephrotoxic effect of vancomycin metabolites" },
    ],
    correctOptionId: "inicet-2025-pharmacology-015-a",
    explanation:
      "Rapid infusion of vancomycin can directly trigger non-immunologic mast cell and basophil degranulation with histamine release, producing the flushing, erythema, and pruritus of red man syndrome, which is not a true allergic reaction. It is managed by slowing the infusion rate and, if needed, premedicating with an antihistamine, rather than by discontinuing vancomycin as would be required for a genuine IgE-mediated allergy.",
    difficulty: "medium",
  },
  {
    id: "neet-pg-2025-pharmacology-016",
    examId: "neet-pg",
    year: 2025,
    subjectId: "pharmacology",
    topicId: "pharmacology--cns-pharmacology",
    stem: "A patient with generalized tonic-clonic seizures is started on sodium valproate. Which mechanism contributes most to its broad-spectrum antiepileptic activity?",
    options: [
      {
        id: "neet-pg-2025-pharmacology-016-a",
        text: "Blockade of voltage-gated sodium channels combined with increased GABAergic transmission",
      },
      {
        id: "neet-pg-2025-pharmacology-016-b",
        text: "Selective blockade of T-type calcium channels in thalamic neurons only",
      },
      { id: "neet-pg-2025-pharmacology-016-c", text: "Positive allosteric modulation of NMDA receptors" },
      { id: "neet-pg-2025-pharmacology-016-d", text: "Inhibition of carbonic anhydrase in glial cells" },
    ],
    correctOptionId: "neet-pg-2025-pharmacology-016-a",
    explanation:
      "Sodium valproate has a dual mechanism involving use-dependent blockade of voltage-gated sodium channels to limit high-frequency neuronal firing, combined with an increase in GABAergic inhibitory transmission through effects on GABA synthesis and turnover, which together account for its efficacy across multiple seizure types. This broad-spectrum activity distinguishes it from agents such as ethosuximide, whose action is limited to T-type calcium channel blockade and is effective mainly in absence seizures.",
    difficulty: "hard",
  },
];
