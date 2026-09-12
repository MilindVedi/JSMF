import { nanoid } from "nanoid";
import type { Attempt, Collection, Question, TestSession } from "@/types";
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
  /** A collection to draw questions from and to record on the session's
   *  filters — used to seed at least one completed session that the
   *  History page's Collections tab/filter can actually match. */
  collection?: Collection;
  targetAccuracy: number;
  timed?: boolean;
  durationSec?: number;
  /** Number of the session's questions to mark as answered. Defaults to
   *  every question (a fully completed session). Passing fewer than `count`
   *  leaves the rest unattempted and the session without a `completedAt`,
   *  i.e. a genuinely in-progress session — used for the one seed session
   *  that demonstrates the dashboard's "Continue where you left off" card. */
  answered?: number;
}): TestSession {
  const pool = params.subjectIds
    ? QUESTIONS.filter((q) => params.subjectIds!.includes(q.subjectId))
    : params.collection
      ? QUESTIONS.filter((q) => params.collection!.questionIds.includes(q.id))
      : QUESTIONS;
  const questions = pickRandom(pool, Math.min(params.count, pool.length));
  const startedAt = daysAgo(params.daysBack, 18);
  const answeredCount = params.answered ?? questions.length;
  const attempts: Record<string, Attempt> = {};

  questions.slice(0, answeredCount).forEach((q, i) => {
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

  const isComplete = answeredCount >= questions.length;
  const completedAt = isComplete
    ? new Date(startedAt.getTime() + questions.length * 45_000 + 60_000).toISOString()
    : undefined;

  return {
    id: nanoid(10),
    mode: params.mode,
    label: params.label,
    questionIds: questions.map((q) => q.id),
    filters: params.subjectIds
      ? { subjectIds: params.subjectIds }
      : params.collection
        ? { collectionIds: [params.collection.id] }
        : undefined,
    config: { timed: Boolean(params.timed), durationSec: params.durationSec },
    flags: {},
    attempts,
    startedAt: startedAt.toISOString(),
    completedAt,
  };
}

export function buildSeedSessions(collections: Collection[]): TestSession[] {
  const pharmacologyCollection = collections.find((c) => c.name === "High-Yield Pharmacology");
  const toughestCollection = collections.find((c) => c.name === "Toughest Questions");

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
    // These two demonstrate the History page's Collections tab/filter —
    // completed with a `filters.collectionIds` set, the way a real
    // "Practise" click from a Collection filter would produce.
    ...(pharmacologyCollection
      ? [
          buildSession({
            daysBack: 6,
            count: 10,
            mode: "browse" as const,
            label: pharmacologyCollection.name,
            collection: pharmacologyCollection,
            targetAccuracy: 0.7,
          }),
        ]
      : []),
    ...(toughestCollection
      ? [
          buildSession({
            daysBack: 2,
            count: 8,
            mode: "custom-test" as const,
            label: toughestCollection.name,
            collection: toughestCollection,
            targetAccuracy: 0.55,
            timed: true,
            durationSec: 900,
          }),
        ]
      : []),
    // Started most recently and left unfinished, so "Continue where you left
    // off" has a realistic partial-progress session to resume by default,
    // instead of only ever showing a freshly-started 0-answered session.
    // Deliberately scoped to a handful of subjects rather than the whole
    // question bank — an unfiltered session's total would equal
    // QUESTIONS.length, which reads as if it should match the dashboard's
    // separate "Questions attempted" stat (a different, unrelated tally
    // across every session combined) even though the two numbers have no
    // reason to line up. A visibly smaller, named subject scope makes it
    // obvious at a glance that this card tracks one particular session, not
    // overall progress. `answered` must stay below the session's own
    // question count or it'd round up to a completed session instead.
    buildSession({
      daysBack: 0,
      count: 48,
      mode: "browse",
      label: "Question Bank",
      subjectIds: ["general-medicine", "pharmacology", "pediatrics"],
      targetAccuracy: 0.7,
      answered: 30,
    }),
  ];
}

export function buildSeedBookmarkIds(): string[] {
  const pool = QUESTIONS.filter((q: Question) => HERO_SUBJECTS.includes(q.subjectId));
  return pickRandom(pool, 9).map((q) => q.id);
}

export function buildSeedCollections(): Collection[] {
  const bySubject = (subjectIds: string[], count: number) =>
    pickRandom(
      QUESTIONS.filter((q) => subjectIds.includes(q.subjectId)),
      count
    ).map((q) => q.id);
  const byDifficulty = (difficulty: Question["difficulty"], count: number) =>
    pickRandom(
      QUESTIONS.filter((q) => q.difficulty === difficulty),
      count
    ).map((q) => q.id);

  const now = Date.now();
  return [
    {
      id: nanoid(8),
      name: "High-Yield Pharmacology",
      description: "Frequently tested pharmacology concepts across recent papers.",
      questionIds: bySubject(["pharmacology"], 14),
      createdAt: new Date(now - 20 * 86_400_000).toISOString(),
    },
    {
      id: nanoid(8),
      name: "Must-Know Pathology",
      description: "Core pathology questions that show up exam after exam.",
      questionIds: bySubject(["pathology"], 14),
      createdAt: new Date(now - 16 * 86_400_000).toISOString(),
    },
    {
      id: nanoid(8),
      name: "PG Entrance Favorites",
      description: "A cross-subject mix pulled from the hero subjects.",
      questionIds: bySubject(HERO_SUBJECTS, 18),
      createdAt: new Date(now - 10 * 86_400_000).toISOString(),
    },
    {
      id: nanoid(8),
      name: "Toughest Questions",
      description: "Hard-difficulty questions worth extra practice time.",
      questionIds: byDifficulty("hard", 12),
      createdAt: new Date(now - 3 * 86_400_000).toISOString(),
    },
    {
      id: nanoid(8),
      name: "Surgery Essentials",
      description: "High-frequency general surgery questions for quick revision.",
      questionIds: bySubject(["general-surgery"], 12),
      createdAt: new Date(now - 12 * 86_400_000).toISOString(),
    },
    {
      id: nanoid(8),
      name: "OBG Rapid Review",
      description: "Obstetrics & gynaecology questions curated for a fast recap.",
      questionIds: bySubject(["obstetrics-gynaecology"], 10),
      createdAt: new Date(now - 7 * 86_400_000).toISOString(),
    },
    {
      id: nanoid(8),
      name: "Pediatrics Quick Hits",
      description: "Commonly tested pediatrics concepts, grouped for a short session.",
      questionIds: bySubject(["pediatrics"], 10),
      createdAt: new Date(now - 5 * 86_400_000).toISOString(),
    },
    {
      id: nanoid(8),
      name: "Warm-Up Set",
      description: "Easy-difficulty questions to start a study session with momentum.",
      questionIds: byDifficulty("easy", 10),
      createdAt: new Date(now - 1 * 86_400_000).toISOString(),
    },
  ];
}
