import type { UserProfile } from "@/types";

export const DEMO_USER: UserProfile = {
  id: "u-demo-1",
  name: "Ananya Rao",
  email: "ananya.rao@example.com",
  targetExamId: "neet-pg",
  joinedAt: "2025-11-02T00:00:00.000Z",
  currentPlanId: "single-exam-pro",
  streakDays: 12,
  lastActiveAt: new Date().toISOString(),
};
