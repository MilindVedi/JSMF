import type { SubscriptionPlan } from "@/types";

/**
 * Pricing is illustrative only — final plans/pricing are not decided yet
 * (see docs/02-v1-scope.md). What matters for the mock is demonstrating an
 * ENTITLEMENTS model (plans differ by which exams/features they unlock)
 * rather than a single boolean "is paid" flag.
 */
export const PLANS: SubscriptionPlan[] = [
  {
    id: "free",
    name: "Free",
    tagline: "Explore the question experience before you commit.",
    priceMonthly: 0,
    entitlements: {
      examIds: [],
      features: [
        "10 practice questions per day",
        "Access to 1 subject at a time",
        "Basic bookmarks",
      ],
    },
  },
  {
    id: "single-exam-pro",
    name: "Single Exam Pro",
    tagline: "Full question bank access for one exam of your choice.",
    priceMonthly: 499,
    priceYearly: 3999,
    entitlements: {
      examIds: ["neet-pg"],
      features: [
        "Unlimited practice for your chosen exam",
        "All 19 subjects, last 5 years",
        "Custom tests, bookmarks & wrong questions",
        "Full performance statistics",
      ],
    },
  },
  {
    id: "all-access-pro",
    name: "All Access Pro",
    tagline: "Everything across NEET-PG, FMGE, and INI-CET.",
    priceMonthly: 999,
    priceYearly: 7999,
    highlight: true,
    entitlements: {
      examIds: ["neet-pg", "fmge", "inicet"],
      features: [
        "Unlimited practice across all 3 exams",
        "All 19 subjects, last 5 years",
        "Timed custom tests & full statistics",
        "Early access to new question drops",
        "Priority support",
      ],
    },
  },
];

export function getPlanById(id: string): SubscriptionPlan | undefined {
  return PLANS.find((p) => p.id === id);
}
