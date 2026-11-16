import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { AppConfig } from '../src/config/config.module';
import { validateEnv } from '../src/config/env';
import { exportRelease } from '../src/modules/questions/application/question-release-export';
import { StorageService } from '../src/modules/storage/application/storage.service';
import { CloudinaryStorageAdapter } from '../src/modules/storage/infrastructure/cloudinary-storage.adapter';
import { GcsStorageAdapter } from '../src/modules/storage/infrastructure/gcs-storage.adapter';
import { LocalStorageAdapter } from '../src/modules/storage/infrastructure/local-storage.adapter';
import { PrismaService } from '../src/shared/prisma/prisma.service';

/**
 * Exports a content release from this (editorial) database: the published
 * questions whose key starts with a prefix, their images and taxonomy, as one
 * file to push in production's admin (Question bank → Import → Push a release).
 * See src/modules/questions/application/question-release.ts and
 * docs/pyq/content-releases.md.
 *
 *   npm run pyq:release:export -- --name fmge-2026-jan --prefix fmge-2026-jan--
 *   npm run pyq:release:export -- --name fmge-2026 --prefix fmge-2026-jan-- --prefix fmge-2026-jun--
 *
 * Options: --out <folder> (default: content-releases/ at the repo root, which
 * git ignores — releases are paid content), --no-archive (skip the copy in the
 * private bucket).
 *
 * Read-only on the database. Writes the file, and — unless --no-archive — a
 * copy to the configured private bucket under pyq/releases/, so every release
 * is kept somewhere other than this machine.
 */
async function main() {
  const { values } = parseArgs({
    options: {
      name: { type: 'string' },
      prefix: { type: 'string', multiple: true },
      out: { type: 'string', default: resolve(__dirname, '../../content-releases') },
      'no-archive': { type: 'boolean', default: false },
    },
  });
  if (!values.name || !values.prefix?.length) {
    throw new Error('Usage: npm run pyq:release:export -- --name <name> --prefix <externalKey prefix> [--prefix …] [--out <folder>] [--no-archive]');
  }

  process.loadEnvFile('.env');
  const env = validateEnv(process.env);
  const config = { get: (key: keyof typeof env) => env[key], isProduction: false, isDevelopment: true } as unknown as AppConfig;
  // As StorageModule wires it: writes to the configured provider, reads from
  // whichever one each image records.
  const adapters = {
    local: new LocalStorageAdapter(config),
    cloudinary: env.CLOUDINARY_CLOUD_NAME ? new CloudinaryStorageAdapter(config) : null,
    gcs: env.GCS_PRIVATE_BUCKET ? new GcsStorageAdapter(config) : null,
  };
  const active = adapters[env.STORAGE_DRIVER];
  if (!active) throw new Error(`STORAGE_DRIVER=${env.STORAGE_DRIVER} is not configured in .env.`);
  const storage = new StorageService(
    active,
    Object.values(adapters).filter((adapter) => adapter !== null),
  );
  const prisma = new PrismaService();

  try {
    const database = new URL(env.DATABASE_URL);
    console.log(`Reading ${database.host}${database.pathname} — published questions starting with ${values.prefix.join(', ')}`);
    const { release, skippedDrafts } = await exportRelease(prisma, storage, { name: values.name, keyPrefixes: values.prefix });
    const json = JSON.stringify(release);

    const stamp = release.createdAt.replace(/[-:]/g, '').replace(/\..*$/, '').replace('T', '-');
    const fileName = `${release.name}-${stamp}.release.json`;
    mkdirSync(values.out, { recursive: true });
    const path = resolve(values.out, fileName);
    writeFileSync(path, json, { flag: 'wx' });

    console.log(`\n${release.questions.length} questions, ${release.images.length} images, ${(json.length / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Taxonomy: ${release.exams.map((e) => e.slug).join(', ')} · ${release.subjects.length} subjects · ${release.topics.length} topics`);
    console.log(`Written: ${path}`);
    if (skippedDrafts.length) {
      console.log(`Left out — not published here, so not approved yet (${skippedDrafts.length}): ${skippedDrafts.join(', ')}`);
    }

    if (!values['no-archive']) {
      const archived = await storage.upload({
        content: Buffer.from(json),
        originalFilename: fileName,
        mimeType: 'application/json',
        visibility: 'PRIVATE',
        keyPrefix: 'pyq/releases',
      });
      console.log(`Archived: ${archived.bucket}/${archived.objectKey}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
