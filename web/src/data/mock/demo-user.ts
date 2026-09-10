import type { UserProfile } from "@/types";

export const DEMO_USER: UserProfile = {
  id: "u-demo-1",
  name: "Ananya Rao",
  email: "ananya.rao@example.com",
  targetExamId: "neet-pg",
  joinedAt: "2025-11-02T00:00:00.000Z",
  // All Access, because the seeded demo activity spans all three exams — a
  // Single Exam plan would contradict what the rest of the mock shows.
  currentPlanId: "all-access-pro",
  streakDays: 12,
  lastActiveAt: new Date().toISOString(),
};
