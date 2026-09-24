import { PrismaClient } from '@prisma/client';
import { Algorithm, hash } from '@node-rs/argon2';

// Must stay in step with ARGON2_OPTIONS in
// src/modules/identity/infrastructure/argon2-password-hasher.ts — a seeded
// admin hashed with different parameters still logs in fine (the app rehashes
// opportunistically), but keeping them aligned avoids a pointless rehash.
const ARGON2_OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

/**
 * Seeds the reference data the platform cannot function without: roles, the
 * first admin account, and the starting taxonomies.
 *
 * Idempotent by design — every write is an upsert keyed on a natural key, so
 * running it against an existing database repairs missing rows rather than
 * duplicating or failing.
 */
const prisma = new PrismaClient();

const ROLES = [
  { key: 'ADMIN', name: 'Administrator', description: 'Full access to the admin panel.' },
  { key: 'EDUCATOR', name: 'Educator', description: 'Can publish and manage their own content.' },
  { key: 'STUDENT', name: 'Student', description: 'Can purchase and access content.' },
];

/** The 19 conventional MBBS subjects, matching the PYQ application's list. */
const SUBJECTS = [
  ['anatomy', 'Anatomy'],
  ['physiology', 'Physiology'],
  ['biochemistry', 'Biochemistry'],
  ['pathology', 'Pathology'],
  ['pharmacology', 'Pharmacology'],
  ['microbiology', 'Microbiology'],
  ['forensic-medicine', 'Forensic Medicine & Toxicology'],
  ['community-medicine', 'Community Medicine (PSM)'],
  ['general-medicine', 'General Medicine'],
  ['general-surgery', 'General Surgery'],
  ['obstetrics-gynaecology', 'Obstetrics & Gynaecology'],
  ['pediatrics', 'Pediatrics'],
  ['orthopedics', 'Orthopedics'],
  ['ophthalmology', 'Ophthalmology'],
  ['ent', 'ENT (Otorhinolaryngology)'],
  ['dermatology', 'Dermatology, Venereology & Leprosy'],
  ['psychiatry', 'Psychiatry'],
  ['radiology', 'Radiology'],
  ['anesthesiology', 'Anesthesiology'],
] as const;

const EXAMS = [
  ['neet-pg', 'NEET-PG'],
  ['fmge', 'FMGE'],
  ['inicet', 'INI-CET'],
] as const;

/**
 * What kind of resource a PDF is. Exists to demonstrate the point of the
 * taxonomy system: this category was not in the original requirements, and
 * adding it needed no migration and no code change — only these rows.
 */
const RESOURCE_TYPES = [
  ['rapid-revision', 'Rapid Revision'],
  ['notes', 'Notes'],
  ['pyq-compilation', 'PYQ Compilation'],
  ['high-yield', 'High-Yield Points'],
  ['mnemonics', 'Mnemonics'],
  ['flowcharts', 'Flowcharts & Tables'],
] as const;

async function seedRoles(): Promise<void> {
  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { key: role.key },
      update: { name: role.name, description: role.description },
      create: role,
    });
  }
  console.log(`  roles: ${ROLES.length}`);
}

/**
 * Creates a bootstrap admin **only when no admin account exists at all**.
 *
 * Admins are normally created through the approval-code flow (`/admin/signup`),
 * which emails a single-use code to ADMIN_APPROVAL_EMAIL. That makes email
 * delivery load-bearing for admin access, so this exists as the escape hatch:
 * if SMTP is misconfigured on a fresh deployment there is still a way in.
 *
 * It disables itself the moment a real admin is registered, so the default
 * credentials do not linger as a permanent shared password nobody rotates —
 * which is precisely what the approval flow replaced.
 */
async function seedAdmin(): Promise<void> {
  const adminRole = await prisma.role.findUniqueOrThrow({ where: { key: 'ADMIN' } });
  const existingAdmins = await prisma.userRole.count({ where: { roleId: adminRole.id } });

  if (existingAdmins > 0) {
    console.log(`  admin: ${existingAdmins} already exist — bootstrap account not created`);
    return;
  }

  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@jsmf.local';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';
  const name = process.env.SEED_ADMIN_NAME ?? 'JSMF Admin';

  const passwordHash = await hash(password, ARGON2_OPTIONS);

  const admin = await prisma.user.upsert({
    where: { email },
    // The password is not reset on re-seed: that would silently revoke a
    // password the operator had already changed.
    update: { name },
    create: { email, name, passwordHash, emailVerifiedAt: new Date() },
  });

  for (const key of ['ADMIN', 'EDUCATOR']) {
    const role = await prisma.role.findUniqueOrThrow({ where: { key } });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: admin.id, roleId: role.id } },
      update: {},
      create: { userId: admin.id, roleId: role.id },
    });
  }

  console.log(`  admin: ${email} (bootstrap — no other admin existed)`);
  console.log(`         create a real admin at /admin/signup, then change this password`);
}

async function seedTaxonomy(
  key: string,
  name: string,
  description: string,
  terms: readonly (readonly [string, string])[],
  options: { isHierarchical?: boolean; isMultiSelect?: boolean; sortOrder: number },
): Promise<void> {
  const taxonomy = await prisma.taxonomy.upsert({
    where: { key },
    update: { name, description, sortOrder: options.sortOrder },
    create: {
      key,
      name,
      description,
      isHierarchical: options.isHierarchical ?? false,
      isMultiSelect: options.isMultiSelect ?? true,
      sortOrder: options.sortOrder,
    },
  });

  // Not a Prisma `upsert`: (taxonomyId, slug) is a PARTIAL unique index scoped
  // to live rows (so a soft-deleted term's slug can be reused), and Prisma's
  // upsert requires a plain unique key to target.
  let index = 0;
  for (const [slug, termName] of terms) {
    const existing = await prisma.taxonomyTerm.findFirst({
      where: { taxonomyId: taxonomy.id, slug, deletedAt: null },
      select: { id: true },
    });

    if (existing) {
      await prisma.taxonomyTerm.update({
        where: { id: existing.id },
        data: { name: termName, sortOrder: index },
      });
    } else {
      await prisma.taxonomyTerm.create({
        data: { taxonomyId: taxonomy.id, slug, name: termName, sortOrder: index },
      });
    }

    index += 1;
  }

  console.log(`  taxonomy "${key}": ${terms.length} terms`);
}

async function main(): Promise<void> {
  console.log('Seeding JSMF database...');

  await seedRoles();
  await seedAdmin();

  await seedTaxonomy('exam', 'Exam', 'Which exam the resource targets.', EXAMS, {
    sortOrder: 0,
  });
  await seedTaxonomy('subject', 'Subject', 'MBBS subject.', SUBJECTS, {
    isHierarchical: true,
    sortOrder: 1,
  });
  // Deliberately created with no terms: topics are added under their subject as
  // real content arrives, rather than guessing a taxonomy up front.
  await seedTaxonomy('topic', 'Topic', 'Topic within a subject.', [], {
    isHierarchical: true,
    sortOrder: 2,
  });
  await seedTaxonomy(
    'resource-type',
    'Resource Type',
    'What kind of study resource this is.',
    RESOURCE_TYPES,
    { sortOrder: 3 },
  );

  console.log('Seed complete.');
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
