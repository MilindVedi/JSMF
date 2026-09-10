import type { Subject } from "@/types";

/**
 * The 19 conventional MBBS subjects. "Hero" subjects (general-medicine,
 * general-surgery, obstetrics-gynaecology, pediatrics, pharmacology,
 * pathology) carry deeper question sets in ./questions — see
 * questions/index.ts for the aggregation and docs/05-ui-ux-plan.md for why
 * the seed content is deliberately uneven across subjects.
 */
export const SUBJECTS: Subject[] = [
  { id: "anatomy", name: "Anatomy", slug: "anatomy", group: "pre-clinical" },
  { id: "physiology", name: "Physiology", slug: "physiology", group: "pre-clinical" },
  { id: "biochemistry", name: "Biochemistry", slug: "biochemistry", group: "pre-clinical" },

  { id: "pathology", name: "Pathology", slug: "pathology", group: "para-clinical" },
  { id: "pharmacology", name: "Pharmacology", slug: "pharmacology", group: "para-clinical" },
  { id: "microbiology", name: "Microbiology", slug: "microbiology", group: "para-clinical" },
  {
    id: "forensic-medicine",
    name: "Forensic Medicine & Toxicology",
    slug: "forensic-medicine",
    group: "para-clinical",
  },
  {
    id: "community-medicine",
    name: "Community Medicine (PSM)",
    slug: "community-medicine",
    group: "para-clinical",
  },

  { id: "general-medicine", name: "General Medicine", slug: "general-medicine", group: "clinical" },
  { id: "general-surgery", name: "General Surgery", slug: "general-surgery", group: "clinical" },
  {
    id: "obstetrics-gynaecology",
    name: "Obstetrics & Gynaecology",
    slug: "obstetrics-gynaecology",
    group: "clinical",
  },
  { id: "pediatrics", name: "Pediatrics", slug: "pediatrics", group: "clinical" },
  { id: "orthopedics", name: "Orthopedics", slug: "orthopedics", group: "clinical" },
  { id: "ophthalmology", name: "Ophthalmology", slug: "ophthalmology", group: "clinical" },
  { id: "ent", name: "ENT (Otorhinolaryngology)", slug: "ent", group: "clinical" },
  {
    id: "dermatology",
    name: "Dermatology, Venereology & Leprosy",
    slug: "dermatology",
    group: "clinical",
  },
  { id: "psychiatry", name: "Psychiatry", slug: "psychiatry", group: "clinical" },
  { id: "radiology", name: "Radiology", slug: "radiology", group: "clinical" },
  { id: "anesthesiology", name: "Anesthesiology", slug: "anesthesiology", group: "clinical" },
];

export const SUBJECT_GROUP_LABEL: Record<Subject["group"], string> = {
  "pre-clinical": "Pre-Clinical",
  "para-clinical": "Para-Clinical",
  clinical: "Clinical",
};

export function getSubjectById(id: string): Subject | undefined {
  return SUBJECTS.find((s) => s.id === id);
}
