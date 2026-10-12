import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  JsmfApp,
  LegalAcceptanceContext,
  LegalChangeKind,
  LegalDocumentType,
  UserStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { LegalAcceptanceService } from './legal-acceptance.service';
import { LegalDocumentsService } from './legal-documents.service';
import { LegalSeedService } from './legal-seed.service';

/**
 * Versioned legal documents against real Postgres (dev stack): seeding,
 * numbering, per-app sections, the database's own immutability rules, and
 * acceptance status with and without enforcement.
 *
 * Published rows cannot be deleted — that is the point — so cleanup lifts the
 * triggers for this table for a moment and deletes exactly the rows this spec
 * created, by id.
 */
let enforced = false;
const config = {
  get(key: string) {
    if (key === 'LEGAL_ACCEPTANCE_REQUIRED') return enforced;
    return process.env[key];
  },
} as never;
const cache = { wrap: (_k: string, _t: number, load: () => unknown) => load(), del: async () => {} } as never;
const audit = { record: async () => {} } as never;

const prisma = new PrismaService();
const documents = new LegalDocumentsService(prisma, cache, audit);
const acceptance = new LegalAcceptanceService(prisma, cache, documents, config);
const seed = new LegalSeedService(prisma, documents);

const meta = { ip: '203.0.113.7', userAgent: 'spec' };
const createdVersionIds: string[] = [];
const userIds: string[] = [];
let admin: { id: string; ip: string | null };

async function newUser() {
  const user = await prisma.user.create({
    data: { email: `legal-spec-${randomUUID()}@jsmf.test`, name: 'Legal Spec', status: UserStatus.ACTIVE },
  });
  userIds.push(user.id);
  return user;
}

const section = (id: string, body: string, apps: JsmfApp[] = []) => ({ id, heading: id, body, apps });

async function publishTerms(kind: LegalChangeKind, marker: string) {
  await documents.saveDraft(
    LegalDocumentType.TERMS,
    { title: 'Terms of Service', sections: [section('shared', `Shared ${marker}`), section('pyq', 'PYQ only', [JsmfApp.PYQ])] },
    admin,
  );
  const row = await documents.publish(LegalDocumentType.TERMS, { changeKind: kind, changeSummary: `spec ${marker}` }, admin);
  createdVersionIds.push(row.id);
  return row;
}

beforeAll(async () => {
  await seed.onApplicationBootstrap();
  admin = { id: (await newUser()).id, ip: null };
  // Leave no stray draft from an earlier, interrupted run.
  await documents.discardDraft(LegalDocumentType.TERMS, admin).catch(() => undefined);
});

afterAll(async () => {
  await prisma.$executeRawUnsafe('ALTER TABLE legal_acceptances DISABLE TRIGGER USER');
  await prisma.$executeRawUnsafe('ALTER TABLE legal_document_versions DISABLE TRIGGER USER');
  try {
    await prisma.legalAcceptance.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.auditLog.deleteMany({ where: { actorUserId: { in: userIds } } });
    await prisma.legalDocumentVersion.deleteMany({ where: { id: { in: createdVersionIds } } });
  } finally {
    await prisma.$executeRawUnsafe('ALTER TABLE legal_acceptances ENABLE TRIGGER USER');
    await prisma.$executeRawUnsafe('ALTER TABLE legal_document_versions ENABLE TRIGGER USER');
  }
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe('legal documents', () => {
  it('seeds every type once, and seeding again is a no-op', async () => {
    const before = await prisma.legalDocumentVersion.count();
    await seed.onApplicationBootstrap();
    expect(await prisma.legalDocumentVersion.count()).toBe(before);
    for (const type of Object.values(LegalDocumentType)) {
      expect((await documents.current(type)).version).toMatch(/^\d+\.\d+$/);
    }
  });

  it('numbers MINOR as x.(y+1) and MAJOR as (x+1).0, and filters sections per app', async () => {
    const start = (await documents.current(LegalDocumentType.TERMS)).version;
    const [major] = start.split('.').map(Number);

    const minor = await publishTerms(LegalChangeKind.MINOR, randomUUID());
    expect(minor.version).toBe(`${major}.${Number(start.split('.')[1]) + 1}`);

    const next = await publishTerms(LegalChangeKind.MAJOR, randomUUID());
    expect(next.version).toBe(`${major + 1}.0`);

    expect((await documents.current(LegalDocumentType.TERMS, JsmfApp.PYQ)).sections.map((s) => s.id)).toEqual(['shared', 'pyq']);
    expect((await documents.current(LegalDocumentType.TERMS, JsmfApp.MAIN)).sections.map((s) => s.id)).toEqual(['shared']);
  });

  it('refuses to publish a draft identical to the latest version', async () => {
    const live = await documents.current(LegalDocumentType.TERMS);
    await documents.saveDraft(LegalDocumentType.TERMS, { title: live.title, sections: live.sections }, admin);
    await expect(
      documents.publish(LegalDocumentType.TERMS, { changeKind: LegalChangeKind.MINOR, changeSummary: 'same' }, admin),
    ).rejects.toThrow(/identical/);
    await documents.discardDraft(LegalDocumentType.TERMS, admin);
  });

  it('the database itself refuses to change or delete a published version', async () => {
    const id = createdVersionIds[0];
    await expect(prisma.legalDocumentVersion.update({ where: { id }, data: { title: 'tampered' } })).rejects.toThrow(
      /cannot be changed/,
    );
    await expect(prisma.legalDocumentVersion.delete({ where: { id } })).rejects.toThrow(/cannot be deleted/);
  });
});

describe('acceptance', () => {
  it('records the server-chosen current version, once, and the trail is append-only', async () => {
    const user = await newUser();
    const live = await documents.current(LegalDocumentType.TERMS);

    const first = await acceptance.accept(
      user.id,
      { documents: [LegalDocumentType.TERMS, LegalDocumentType.PRIVACY], app: JsmfApp.PYQ, context: LegalAcceptanceContext.SIGNUP },
      meta,
    );
    expect(first.recorded.find((r) => r.type === LegalDocumentType.TERMS)!.version).toBe(live.version);

    await acceptance.accept(user.id, { documents: [LegalDocumentType.TERMS], app: JsmfApp.MAIN, context: LegalAcceptanceContext.RE_ACCEPT }, meta);
    const rows = await prisma.legalAcceptance.findMany({ where: { userId: user.id } });
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.versionId === live.id)).toMatchObject({ kind: 'ACCEPTED', ipAddress: meta.ip });

    await expect(prisma.legalAcceptance.delete({ where: { id: rows[0].id } })).rejects.toThrow(/append-only/);
  });

  it('a minor version keeps a user up to date; a major one makes it required only when enforced', async () => {
    const user = await newUser();
    await acceptance.accept(
      user.id,
      { documents: [LegalDocumentType.TERMS, LegalDocumentType.PRIVACY], app: JsmfApp.PYQ, context: LegalAcceptanceContext.SIGNUP },
      meta,
    );

    await publishTerms(LegalChangeKind.MINOR, randomUUID());
    let terms = (await acceptance.status(user.id)).documents.find((d) => d.type === LegalDocumentType.TERMS)!;
    expect(terms).toMatchObject({ upToDate: true, hasUpdate: true, required: false });

    await publishTerms(LegalChangeKind.MAJOR, randomUUID());
    terms = (await acceptance.status(user.id)).documents.find((d) => d.type === LegalDocumentType.TERMS)!;
    expect(terms).toMatchObject({ upToDate: false, required: false });
    expect(await acceptance.pending(user.id)).toEqual([]);

    enforced = true;
    try {
      expect(await acceptance.pending(user.id)).toEqual([LegalDocumentType.TERMS]);
      await acceptance.accept(user.id, { documents: [LegalDocumentType.TERMS], app: JsmfApp.PYQ, context: LegalAcceptanceContext.RE_ACCEPT }, meta);
      expect(await acceptance.pending(user.id)).toEqual([]);
    } finally {
      enforced = false;
    }
  });

  it('a checkout acknowledgement needs an order that belongs to the user', async () => {
    const user = await newUser();
    await expect(
      acceptance.accept(user.id, { documents: [LegalDocumentType.REFUND], app: JsmfApp.STORE, context: LegalAcceptanceContext.CHECKOUT }, meta),
    ).rejects.toThrow(/needs its order/);
    await expect(
      acceptance.accept(
        user.id,
        { documents: [LegalDocumentType.REFUND], app: JsmfApp.STORE, context: LegalAcceptanceContext.CHECKOUT, orderId: randomUUID() },
        meta,
      ),
    ).rejects.toThrow(/Order not found/);
  });
});
