import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  Difficulty,
  PracticeMode,
  QuestionStatus,
  UserStatus,
} from "@prisma/client";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { randomUUID } from "node:crypto";
import { RolesGuard } from "../../../common/guards/roles.guard";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import { EntitlementService } from "../../entitlements/application/entitlement.service";
import { AdminQuestionContentController } from "../http/admin-question-content.controller";
import { AdminQuestionsController } from "../http/admin-questions.controller";
import { PracticeService } from "./practice.service";
import { ProgressService } from "./progress.service";
import { PyqAccessService } from "./pyq-access.service";
import { PyqTaxonomyAdminService } from "./pyq-taxonomy-admin.service";
import {
  QuestionAdminService,
  type AdminQuestionInput,
} from "./question-admin.service";
import { QuestionBankService } from "./question-bank.service";

/**
 * Admin content editing against a real Postgres. What matters: invalid
 * questions never get written, deleting a question never breaks a student's
 * history, and only admins get in.
 */

const config = {
  get(key: string) {
    if (key === "PYQ_FREE_DAILY_QUESTIONS") return 1000;
    return process.env[key];
  },
} as never;

const prisma = new PrismaService();
const access = new PyqAccessService(
  prisma,
  new EntitlementService(prisma),
  config,
);
const bank = new QuestionBankService(prisma);
const practice = new PracticeService(prisma, bank, access);
const progress = new ProgressService(prisma, bank);
const admin = new QuestionAdminService(prisma);
const taxonomy = new PyqTaxonomyAdminService(prisma);

const run = randomUUID().slice(0, 8);
const EXAM = `adm-exam-${run}`;
const SUBJECT = `adm-subject-${run}`;
const TOPIC = `${SUBJECT}--renal`;
const userIds: string[] = [];
let actorId = "";

function input(
  overrides: Partial<AdminQuestionInput> = {},
): AdminQuestionInput {
  return {
    externalKey: `adm-${run}-${randomUUID().slice(0, 6)}`,
    examId: EXAM,
    subjectId: SUBJECT,
    topicId: TOPIC,
    year: 2023,
    stem: "Which is the loop diuretic?",
    explanation: "Furosemide acts on the thick ascending limb.",
    difficulty: Difficulty.EASY,
    status: QuestionStatus.PUBLISHED,
    options: [
      { text: "Furosemide", isCorrect: true },
      { text: "Spironolactone", isCorrect: false },
      { text: "Mannitol", isCorrect: false },
    ],
    ...overrides,
  };
}

async function createUser() {
  const user = await prisma.user.create({
    data: {
      email: `pyq-admin-spec-${randomUUID()}@jsmf.test`,
      name: "PYQ Admin Spec",
      status: UserStatus.ACTIVE,
    },
  });
  userIds.push(user.id);
  return user;
}

beforeAll(async () => {
  await prisma.$connect();
  actorId = (await createUser()).id;
  await taxonomy.createExam({ slug: EXAM, name: "Admin Spec Exam" }, actorId);
  await taxonomy.createSubject(
    { slug: SUBJECT, name: "Admin Spec", group: "clinical" },
    actorId,
  );
  await taxonomy.createTopic(
    { slug: TOPIC, subjectId: SUBJECT, name: "Renal" },
    actorId,
  );
});

afterAll(async () => {
  await prisma.practiceSession.deleteMany({
    where: { userId: { in: userIds } },
  });
  await prisma.question.deleteMany({
    where: { externalKey: { startsWith: `adm-${run}-` } },
  });
  await prisma.topic.deleteMany({ where: { subject: { slug: SUBJECT } } });
  await prisma.subject.deleteMany({ where: { slug: SUBJECT } });
  await prisma.exam.deleteMany({ where: { slug: EXAM } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe("validation", () => {
  it("rejects zero or two correct options, and too few or too many options", async () => {
    const options = input().options;
    await expect(
      admin.create(
        input({ options: options.map((o) => ({ ...o, isCorrect: false })) }),
        actorId,
      ),
    ).rejects.toThrow(/exactly one correct/);
    await expect(
      admin.create(
        input({ options: options.map((o) => ({ ...o, isCorrect: true })) }),
        actorId,
      ),
    ).rejects.toThrow(/exactly one correct/);
    await expect(
      admin.create(
        input({ options: [{ text: "Only", isCorrect: true }] }),
        actorId,
      ),
    ).rejects.toThrow(/between 2 and 6/);
    await expect(
      admin.create(
        input({
          options: Array.from({ length: 7 }, (_, i) => ({
            text: `O${i}`,
            isCorrect: i === 0,
          })),
        }),
        actorId,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects a topic from another subject and unknown taxonomy", async () => {
    await expect(
      admin.create(input({ examId: "no-such-exam" }), actorId),
    ).rejects.toThrow(/Unknown exam/);
    const other = `adm-other-${run}`;
    await taxonomy.createSubject(
      { slug: other, name: "Other", group: "clinical" },
      actorId,
    );
    await expect(
      admin.create(input({ subjectId: other }), actorId),
    ).rejects.toThrow(/different subject/);
    await taxonomy.deleteSubject(other, actorId);
  });

  it("validates option edits the same way", async () => {
    const created = await admin.create(input(), actorId);
    await expect(
      admin.update(
        created.id,
        {
          options: created.options.map((o) => ({
            id: o.id,
            text: o.text,
            isCorrect: true,
          })),
        },
        actorId,
      ),
    ).rejects.toThrow(/exactly one correct/);
  });
});

describe("editing", () => {
  it("creates, lists with filters and report counts, and edits keeping option ids", async () => {
    const created = await admin.create(
      input({ stem: `Needle ${run} haystack` }),
      actorId,
    );
    expect(created.status).toBe(QuestionStatus.PUBLISHED);
    expect(created.options.map((o) => o.label)).toEqual(["A", "B", "C"]);

    const listed = await admin.list(
      { subjectId: SUBJECT, q: `needle ${run}` },
      1,
      20,
    );
    expect(listed.items.map((q) => q.id)).toEqual([created.id]);
    expect(listed.items[0].reports).toEqual({ open: 0, total: 0 });

    const [a, b, c] = created.options;
    const updated = await admin.update(
      created.id,
      {
        stem: "Edited stem",
        options: [
          { id: c.id, text: "Mannitol", isCorrect: false },
          { id: a.id, text: "Furosemide (loop)", isCorrect: false },
          { id: b.id, text: "Spironolactone", isCorrect: true },
          { text: "Acetazolamide", isCorrect: false },
        ],
      },
      actorId,
    );
    expect(updated.stem).toBe("Edited stem");
    expect(updated.options.map((o) => o.id).slice(0, 3)).toEqual([
      c.id,
      a.id,
      b.id,
    ]);
    expect(updated.options.map((o) => o.label)).toEqual(["A", "B", "C", "D"]);
    expect(updated.correctOptionId).toBe(b.id);
  });

  it("will not remove an option a student has chosen", async () => {
    const created = await admin.create(input(), actorId);
    const student = await createUser();
    const session = await practice.start(student.id, {
      mode: PracticeMode.PRACTICE,
      questionIds: [created.id],
    });
    await practice.answer(student.id, session.id, {
      questionId: created.id,
      selectedOptionId: created.options[2].id,
    });
    await expect(
      admin.update(
        created.id,
        {
          options: created.options
            .slice(0, 2)
            .map((o) => ({
              id: o.id,
              text: o.text,
              isCorrect: o.id === created.correctOptionId,
            })),
        },
        actorId,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe("soft delete", () => {
  it("hides the question but keeps past sessions and their review working", async () => {
    const created = await admin.create(input(), actorId);
    const student = await createUser();
    const session = await practice.start(student.id, {
      mode: PracticeMode.TEST,
      questionIds: [created.id],
    });
    await practice.answer(student.id, session.id, {
      questionId: created.id,
      selectedOptionId: created.correctOptionId!,
    });
    await practice.submit(student.id, session.id);

    await admin.remove(created.id, actorId);

    await expect(admin.get(created.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(
      (await admin.list({ subjectId: SUBJECT }, 1, 100)).items.map((q) => q.id),
    ).not.toContain(created.id);
    expect(
      await bank.matchingIds(student.id, { subjectIds: [SUBJECT] }),
    ).not.toContain(created.id);

    const review = await practice.review(student.id, session.id);
    expect(JSON.stringify(review)).toContain(created.id);
    expect(JSON.stringify(review)).toContain("Furosemide acts");
    expect((await practice.history(student.id, 1, 10)).items).toHaveLength(1);

    await expect(admin.remove(created.id, actorId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe("taxonomy", () => {
  it("renames and reorders, and refuses to delete what questions reference", async () => {
    await admin.create(input(), actorId);
    await taxonomy.updateTopic(TOPIC, { name: "Renal physiology" }, actorId);
    const second = `${SUBJECT}--acid-base`;
    await taxonomy.createTopic(
      { slug: second, subjectId: SUBJECT, name: "Acid-base" },
      actorId,
    );
    const tree = await taxonomy.reorder("topics", [second, TOPIC], actorId);
    const mine = tree.topics.filter((t) => t.subjectId === SUBJECT);
    expect(mine.map((t) => t.id)).toEqual([second, TOPIC]);
    expect(mine[1].name).toBe("Renal physiology");

    await expect(taxonomy.deleteTopic(TOPIC, actorId)).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(taxonomy.deleteExam(EXAM, actorId)).rejects.toBeInstanceOf(
      ConflictException,
    );
    await taxonomy.deleteTopic(second, actorId);
    await expect(
      taxonomy.createExam({ slug: EXAM, name: "Duplicate" }, actorId),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe("reports", () => {
  it("counts open reports and resolves or dismisses each exactly once", async () => {
    const created = await admin.create(input(), actorId);
    const student = await createUser();
    const first = await progress.report(student.id, created.id, {
      reason: "WRONG_ANSWER",
    });
    const second = await progress.report(student.id, created.id, {
      reason: "OTHER",
    });

    expect((await admin.get(created.id)).reports).toEqual({
      open: 2,
      total: 2,
    });
    const reported = await admin.list(
      { subjectId: SUBJECT, reported: true },
      1,
      50,
    );
    expect(reported.items.map((q) => q.id)).toEqual([created.id]);

    const open = await admin.listReports(
      { status: "OPEN", questionId: created.id },
      1,
      20,
    );
    expect(open.total).toBe(2);

    const resolved = await admin.resolveReport(
      first.id,
      "RESOLVED",
      "Fixed key",
      actorId,
    );
    expect(resolved.status).toBe("RESOLVED");
    expect(resolved.resolvedAt).toBeInstanceOf(Date);
    // The decision survives beyond the activity log: who closed it and why.
    expect(resolved.adminNote).toBe("Fixed key");
    expect(resolved.resolvedById).toBe(actorId);
    const closedRow = (
      await admin.listReports({ questionId: created.id }, 1, 20)
    ).items.find((r) => r.id === first.id);
    expect(closedRow?.adminNote).toBe("Fixed key");
    expect(closedRow?.resolvedBy?.id).toBe(actorId);

    await admin.resolveReport(second.id, "DISMISSED", undefined, actorId);
    await expect(
      admin.resolveReport(first.id, "DISMISSED", undefined, actorId),
    ).rejects.toBeInstanceOf(ConflictException);

    expect((await admin.get(created.id)).reports).toEqual({
      open: 0,
      total: 2,
    });
    expect(
      (
        await admin.listReports(
          { status: "OPEN", questionId: created.id },
          1,
          20,
        )
      ).total,
    ).toBe(0);
  });
});

describe("roles", () => {
  const guard = new RolesGuard(new Reflector());
  function contextFor(
    controller: object,
    handler: string,
    roles: string[],
  ): ExecutionContext {
    return {
      getClass: () => controller,
      getHandler: () =>
        (controller as { prototype: Record<string, unknown> }).prototype[
          handler
        ],
      switchToHttp: () => ({
        getRequest: () => ({ user: { id: "u", roles } }),
      }),
    } as unknown as ExecutionContext;
  }

  it("lets admins in and gives everyone else 403 on every admin PYQ endpoint", () => {
    const handlers: [object, string[]][] = [
      [
        AdminQuestionContentController,
        [
          "list",
          "get",
          "create",
          "update",
          "setStatus",
          "remove",
          "tree",
          "createExam",
          "reorderTopics",
          "deleteSubject",
          "reports",
          "resolveReport",
        ],
      ],
      [AdminQuestionsController, ["import"]],
    ];
    for (const [controller, names] of handlers) {
      for (const name of names) {
        expect(guard.canActivate(contextFor(controller, name, ["ADMIN"]))).toBe(
          true,
        );
        expect(() =>
          guard.canActivate(contextFor(controller, name, ["USER"])),
        ).toThrow(ForbiddenException);
      }
    }
  });
});
