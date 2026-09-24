import { Global, Injectable, Module } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';

/**
 * The subset of PrismaClient an audit write needs, so a caller can pass either
 * the service or an open transaction client.
 */
export type AuditWriter = Pick<PrismaService, 'auditLog'> | Prisma.TransactionClient;

export interface AuditEntry {
  actorUserId?: string | null;
  /** Verb in the past tense, scoped by entity: `product.published`. */
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
}

/**
 * Writes the admin audit trail.
 *
 * `record` takes the Prisma client to write with, so that an audit row can be
 * written inside the same transaction as the change it describes. That makes
 * the two atomic: a published product without a corresponding audit row, or an
 * audit row for a publish that was rolled back, are both impossible. Logging
 * after the fact and hoping it succeeds would allow either.
 *
 * `audit_logs.actor_user_id` is SetNull, so the trail outlives the account that
 * produced it.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry, writer: AuditWriter = this.prisma): Promise<void> {
    await writer.auditLog.create({
      data: {
        actorUserId: entry.actorUserId ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        before: toJson(entry.before),
        after: toJson(entry.after),
        ip: entry.ip ?? null,
      },
    });
  }
}

/**
 * Money is BigInt throughout and Prisma's Json columns cannot take it, so the
 * snapshot is normalised through the same BigInt→string rule the API uses for
 * responses. Without this, auditing any priced entity would throw at the point
 * of writing the record rather than anywhere near the actual mistake.
 */
function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;

  return JSON.parse(
    JSON.stringify(value, (_key, raw: unknown) =>
      typeof raw === 'bigint' ? raw.toString() : raw,
    ),
  ) as Prisma.InputJsonValue;
}

@Global()
@Module({
  imports: [PrismaModule],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
