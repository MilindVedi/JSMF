import type { Exam } from "@/types";

export const EXAMS: Exam[] = [
  {
    id: "neet-pg",
    name: "NEET-PG",
    shortName: "NEET-PG",
    description:
      "National Eligibility cum Entrance Test for Postgraduate (NEET-PG) — the entrance examination for MD/MS and PG diploma courses at medical colleges across India.",
  },
  {
    id: "fmge",
    name: "FMGE",
    shortName: "FMGE",
    description:
      "Foreign Medical Graduate Examination (FMGE) — the licensing screening test for Indian nationals who completed their MBBS degree outside India.",
  },
  {
    id: "inicet",
    name: "INI-CET",
    shortName: "INI-CET",
    description:
      "Institute of National Importance Combined Entrance Test (INI-CET) — the joint entrance test for postgraduate admission to AIIMS, JIPMER, PGIMER and other INIs.",
  },
];
