import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma, VerificationPurpose } from '@prisma/client';
import { randomBytes, randomInt } from 'node:crypto';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { PasswordHasher } from '../domain/password-hasher.port';

export interface IssueCodeInput {
  purpose: VerificationPurpose;
  /** The email or user id this code is about. */
  subject: string;
  ttlMinutes: number;
  /** Where it was delivered, when it was emailed at all. */
  sentToEmail?: string | null;
  userId?: string | null;
  metadata?: Prisma.InputJsonValue;
  ip?: string | null;
  /**
   * `digits` for something a human retypes from an email; `token` for machine
   * handoff, where there is no usability reason to keep the keyspace small.
   */
  format?: 'digits' | 'token';
  maxAttempts?: number;
}

export interface VerifiedCode {
  id: string;
  subject: string;
  userId: string | null;
  metadata: Prisma.JsonValue;
}

/**
 * One-time codes: issue, verify, consume.
 *
 * Every flow that needs "prove you received this secret" shares this — admin
 * registration OTPs, OAuth handoff, and the password-reset and
 * email-verification flows that will follow. They differ only in what the code
 * means, so they differ only by `purpose`. Four separate implementations would
 * be four chances to get expiry, single-use or attempt-limiting subtly wrong,
 * and the one that is wrong is the one that gets exploited.
 *
 * Three properties are enforced here and nowhere else:
 *
 * - **Single use.** Consumption is a conditional update, so two requests racing
 *   with the same code result in exactly one success.
 * - **Attempt limited.** A six-digit code is one-in-a-million per guess, which
 *   is nothing if guesses are unlimited. Every failure increments a counter and
 *   the code dies at `maxAttempts`.
 * - **Superseded on reissue.** Requesting a new code invalidates the previous
 *   one for that subject, so a stale code cannot be used later.
 */
@Injectable()
export class VerificationCodeService {
  private readonly logger = new Logger(VerificationCodeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly hasher: PasswordHasher,
  ) {}

  /**
   * Issues a code and returns the **plaintext**, which is the only moment it
   * exists in readable form — only its hash is stored. The caller is
   * responsible for delivering it and must not log it.
   */
  async issue(input: IssueCodeInput): Promise<string> {
    const code = input.format === 'token' ? randomBytes(32).toString('base64url') : sixDigits();

    // Supersede any live code for this subject and purpose. Without this, a
    // user who requests a second code because the first did not arrive would
    // leave two valid codes outstanding, doubling the guessing surface.
    await this.prisma.verificationCode.updateMany({
      where: { purpose: input.purpose, subject: input.subject, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    await this.prisma.verificationCode.create({
      data: {
        purpose: input.purpose,
        subject: input.subject,
        codeHash: await this.hasher.hash(code),
        sentToEmail: input.sentToEmail ?? null,
        userId: input.userId ?? null,
        metadata: input.metadata ?? {},
        expiresAt: new Date(Date.now() + input.ttlMinutes * 60_000),
        maxAttempts: input.maxAttempts ?? 5,
        createdIp: input.ip ?? null,
      },
    });

    return code;
  }

  /**
   * Verifies and consumes a code, or throws.
   *
   * Every failure mode returns the same message on purpose. Distinguishing
   * "expired" from "wrong" from "too many attempts" would tell someone probing
   * the endpoint whether they had found a real pending request.
   */
  async consume(input: {
    purpose: VerificationPurpose;
    subject: string;
    code: string;
  }): Promise<VerifiedCode> {
    const rejected = (): never => {
      throw new BadRequestException('That code is invalid or has expired.');
    };

    const record = await this.prisma.verificationCode.findFirst({
      where: {
        purpose: input.purpose,
        subject: input.subject,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!record) return rejected();

    if (record.attempts >= record.maxAttempts) {
      await this.prisma.verificationCode.update({
        where: { id: record.id },
        data: { consumedAt: new Date() },
      });
      this.logger.warn(
        `Verification code for ${input.purpose}/${input.subject} exhausted its attempts`,
      );
      return rejected();
    }

    if (!(await this.hasher.verify(record.codeHash, input.code))) {
      await this.prisma.verificationCode.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });
      return rejected();
    }

    // Conditional consume: whoever flips consumed_at from NULL wins, so a code
    // submitted twice concurrently succeeds exactly once.
    const consumed = await this.prisma.verificationCode.updateMany({
      where: { id: record.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    if (consumed.count !== 1) return rejected();

    return {
      id: record.id,
      subject: record.subject,
      userId: record.userId,
      metadata: record.metadata,
    };
  }
}

/**
 * Uniform over 000000–999999 via `randomInt`, which is rejection-sampled.
 * `Math.random()` is not cryptographically random, and `% 1000000` on raw bytes
 * skews the distribution.
 */
function sixDigits(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}
