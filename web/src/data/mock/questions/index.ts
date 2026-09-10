import type { Question } from "@/types";

// Hero subjects (deeper question sets)
import { GENERAL_MEDICINE_QUESTIONS } from "./general-medicine";
import { GENERAL_SURGERY_QUESTIONS } from "./general-surgery";
import { PATHOLOGY_QUESTIONS } from "./pathology";
import { OBSTETRICS_GYNAECOLOGY_QUESTIONS } from "./obstetrics-gynaecology";
import { PEDIATRICS_QUESTIONS } from "./pediatrics";
import { PHARMACOLOGY_QUESTIONS } from "./pharmacology";

// Lighter subjects
import { ANATOMY_QUESTIONS } from "./anatomy";
import { PHYSIOLOGY_QUESTIONS } from "./physiology";
import { BIOCHEMISTRY_QUESTIONS } from "./biochemistry";
import { MICROBIOLOGY_QUESTIONS } from "./microbiology";
import { FORENSIC_MEDICINE_QUESTIONS } from "./forensic-medicine";
import { COMMUNITY_MEDICINE_QUESTIONS } from "./community-medicine";
import { ORTHOPEDICS_QUESTIONS } from "./orthopedics";
import { OPHTHALMOLOGY_QUESTIONS } from "./ophthalmology";
import { ENT_QUESTIONS } from "./ent";
import { DERMATOLOGY_QUESTIONS } from "./dermatology";
import { PSYCHIATRY_QUESTIONS } from "./psychiatry";
import { RADIOLOGY_QUESTIONS } from "./radiology";
import { ANESTHESIOLOGY_QUESTIONS } from "./anesthesiology";

export const QUESTIONS: Question[] = [
  ...GENERAL_MEDICINE_QUESTIONS,
  ...GENERAL_SURGERY_QUESTIONS,
  ...PATHOLOGY_QUESTIONS,
  ...OBSTETRICS_GYNAECOLOGY_QUESTIONS,
  ...PEDIATRICS_QUESTIONS,
  ...PHARMACOLOGY_QUESTIONS,
  ...ANATOMY_QUESTIONS,
  ...PHYSIOLOGY_QUESTIONS,
  ...BIOCHEMISTRY_QUESTIONS,
  ...MICROBIOLOGY_QUESTIONS,
  ...FORENSIC_MEDICINE_QUESTIONS,
  ...COMMUNITY_MEDICINE_QUESTIONS,
  ...ORTHOPEDICS_QUESTIONS,
  ...OPHTHALMOLOGY_QUESTIONS,
  ...ENT_QUESTIONS,
  ...DERMATOLOGY_QUESTIONS,
  ...PSYCHIATRY_QUESTIONS,
  ...RADIOLOGY_QUESTIONS,
  ...ANESTHESIOLOGY_QUESTIONS,
];

export function getQuestionById(id: string): Question | undefined {
  return QUESTIONS.find((q) => q.id === id);
}
