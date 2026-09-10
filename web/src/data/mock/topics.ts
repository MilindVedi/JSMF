import type { Topic } from "@/types";

/**
 * Topic ids follow the convention `${subjectId}--${topic-slug}` so a topic
 * id alone reveals its parent subject without a lookup.
 */
function topicsFor(subjectId: string, names: string[]): Topic[] {
  return names.map((name) => ({
    id: `${subjectId}--${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`,
    subjectId,
    name,
  }));
}

export const TOPICS: Topic[] = [
  ...topicsFor("anatomy", [
    "Upper Limb",
    "Lower Limb",
    "Neuroanatomy",
    "Embryology",
    "Histology",
  ]),
  ...topicsFor("physiology", [
    "Cardiovascular Physiology",
    "Respiratory Physiology",
    "Renal Physiology",
    "Endocrine Physiology",
    "Neurophysiology",
  ]),
  ...topicsFor("biochemistry", [
    "Enzymology",
    "Carbohydrate Metabolism",
    "Lipid Metabolism",
    "Molecular Biology",
    "Vitamins & Nutrition",
  ]),
  ...topicsFor("pathology", [
    "General Pathology",
    "Hematology",
    "Cardiovascular Pathology",
    "Gastrointestinal Pathology",
    "Neoplasia",
  ]),
  ...topicsFor("pharmacology", [
    "Autonomic Pharmacology",
    "Cardiovascular Pharmacology",
    "Antimicrobial Pharmacology",
    "CNS Pharmacology",
    "Endocrine Pharmacology",
    "Chemotherapy",
  ]),
  ...topicsFor("microbiology", [
    "Bacteriology",
    "Virology",
    "Parasitology",
    "Mycology",
    "Immunology",
  ]),
  ...topicsFor("forensic-medicine", [
    "Forensic Pathology",
    "Toxicology",
    "Medical Jurisprudence",
    "Sexual Offences & Examination",
  ]),
  ...topicsFor("community-medicine", [
    "Epidemiology",
    "Biostatistics",
    "Nutrition & Public Health",
    "Maternal & Child Health",
    "Environmental Health",
  ]),
  ...topicsFor("general-medicine", [
    "Cardiology",
    "Nephrology",
    "Gastroenterology",
    "Endocrinology",
    "Neurology",
    "Infectious Diseases",
    "Pulmonology",
    "Rheumatology",
  ]),
  ...topicsFor("general-surgery", [
    "Gastrointestinal Surgery",
    "Hepatobiliary Surgery",
    "Urology",
    "Surgical Oncology",
    "Trauma & Emergency Surgery",
    "Vascular Surgery",
  ]),
  ...topicsFor("obstetrics-gynaecology", [
    "Antenatal Care",
    "Labour & Delivery",
    "High-Risk Pregnancy",
    "Gynaecological Oncology",
    "Menstrual Disorders",
    "Infertility",
  ]),
  ...topicsFor("pediatrics", [
    "Neonatology",
    "Growth & Development",
    "Pediatric Infectious Diseases",
    "Nutrition & Immunization",
    "Congenital Disorders",
  ]),
  ...topicsFor("orthopedics", [
    "Fractures & Trauma",
    "Bone Tumors",
    "Joint Disorders",
    "Spine Disorders",
  ]),
  ...topicsFor("ophthalmology", [
    "Cornea & Refraction",
    "Cataract & Lens",
    "Glaucoma",
    "Retina & Vitreous",
  ]),
  ...topicsFor("ent", [
    "Ear Disorders",
    "Nose & Sinus Disorders",
    "Throat & Larynx Disorders",
    "Head & Neck Tumors",
  ]),
  ...topicsFor("dermatology", [
    "Infectious Skin Disorders",
    "Papulosquamous Disorders",
    "Leprosy",
    "Sexually Transmitted Infections",
  ]),
  ...topicsFor("psychiatry", [
    "Mood Disorders",
    "Psychotic Disorders",
    "Anxiety Disorders",
    "Substance Use Disorders",
  ]),
  ...topicsFor("radiology", [
    "Chest Imaging",
    "Abdominal Imaging",
    "Neuroimaging",
    "Musculoskeletal Imaging",
  ]),
  ...topicsFor("anesthesiology", [
    "General Anesthesia",
    "Regional Anesthesia",
    "Critical Care",
    "Pain Management",
  ]),
];

export function getTopicsBySubject(subjectId: string): Topic[] {
  return TOPICS.filter((t) => t.subjectId === subjectId);
}

export function getTopicById(id: string): Topic | undefined {
  return TOPICS.find((t) => t.id === id);
}
