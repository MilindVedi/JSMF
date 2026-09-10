import { nanoid } from "nanoid";
import type { Attempt, Question, TestSession } from "@/types";
import { QUESTIONS } from "@/data/mock/questions";

/**
 * Builds a handful of plausible completed practice sessions and bookmarks so
 * the dashboard, history, statistics, and wrong-questions screens don't look
 * empty on first load. This only ever runs once (the stores guard against
 * re-seeding when they already hold data) — see components/common/seed-demo-data.tsx.
 */
function pickRandom<T>(arr: T[], count: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  for (let i = 0; i < count && copy.length > 0; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
}

function daysAgo(days: number, hour = 19) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, Math.floor(Math.random() * 59), 0, 0);
  return d;
}

const HERO_SUBJECTS = [
  "general-medicine",
  "general-surgery",
  "pathology",
  "obstetrics-gynaecology",
  "pediatrics",
  "pharmacology",
];

function buildSession(params: {
  daysBack: number;
  count: number;
  mode: TestSession["mode"];
  label: string;
  subjectIds?: string[];
  targetAccuracy: number;
  timed?: boolean;
  durationSec?: number;
}): TestSession {
  const pool = params.subjectIds
    ? QUESTIONS.filter((q) => params.subjectIds!.includes(q.subjectId))
    : QUESTIONS;
  const questions = pickRandom(pool, Math.min(params.count, pool.length));
  const startedAt = daysAgo(params.daysBack, 18);
  const attempts: Record<string, Attempt> = {};

  questions.forEach((q, i) => {
    const answeredAt = new Date(startedAt.getTime() + i * 45_000).toISOString();
    const isCorrect = Math.random() < params.targetAccuracy;
    const wrongOption = q.options.find((o) => o.id !== q.correctOptionId);
    const selectedOptionId = isCorrect ? q.correctOptionId : wrongOption?.id ?? q.correctOptionId;
    attempts[q.id] = {
      questionId: q.id,
      selectedOptionId,
      isCorrect,
      timeSpentSec: 25 + Math.floor(Math.random() * 60),
      answeredAt,
    };
  });

  const completedAt = new Date(startedAt.getTime() + questions.length * 45_000 + 60_000).toISOString();

  return {
    id: nanoid(10),
    mode: params.mode,
    label: params.label,
    questionIds: questions.map((q) => q.id),
    filters: params.subjectIds ? { subjectIds: params.subjectIds } : undefined,
    config: { timed: Boolean(params.timed), durationSec: params.durationSec },
    flags: {},
    attempts,
    startedAt: startedAt.toISOString(),
    completedAt,
  };
}

export function buildSeedSessions(): TestSession[] {
  return [
    buildSession({
      daysBack: 18,
      count: 15,
      mode: "custom-test",
      label: "General Medicine · Custom Test",
      subjectIds: ["general-medicine"],
      targetAccuracy: 0.6,
    }),
    buildSession({
      daysBack: 13,
      count: 20,
      mode: "custom-test",
      label: "Mixed Subjects · Timed Test",
      subjectIds: HERO_SUBJECTS,
      targetAccuracy: 0.65,
      timed: true,
      durationSec: 1200,
    }),
    buildSession({
      daysBack: 8,
      count: 12,
      mode: "browse",
      label: "Pharmacology · Question Bank",
      subjectIds: ["pharmacology"],
      targetAccuracy: 0.75,
    }),
    buildSession({
      daysBack: 4,
      count: 18,
      mode: "custom-test",
      label: "Surgery & OBG · Custom Test",
      subjectIds: ["general-surgery", "obstetrics-gynaecology"],
      targetAccuracy: 0.72,
    }),
    buildSession({
      daysBack: 1,
      count: 10,
      mode: "browse",
      label: "Pathology · Question Bank",
      subjectIds: ["pathology"],
      targetAccuracy: 0.8,
    }),
  ];
}

export function buildSeedBookmarkIds(): string[] {
  const pool = QUESTIONS.filter((q: Question) => HERO_SUBJECTS.includes(q.subjectId));
  return pickRandom(pool, 9).map((q) => q.id);
}
