import { readFileSync } from 'node:fs';
import {
  EntitlementSource,
  EntitlementStatus,
  OrderStatus,
  PaymentProvider,
  PaymentStatus,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { EXAM_OPTIONS, STAGE_OPTIONS } from '../src/modules/events/domain/session-display';

/**
 * Brings people who bought a seat through the external Razorpay Payment Page
 * into the platform as ordinary buyers.
 *
 * Those purchases never touched JSMF: the Payment Page took the money on the
 * Razorpay account directly, so there is no user, no order, and no entitlement
 * here — and every automation that serves attendees reads exactly those rows.
 * Without this, those buyers are invisible to the seat count, to the reminder
 * before each day, to the "Notify attendees" send, and to the bundled PDF
 * whenever it is released.
 *
 * **Both halves are needed, and this is the thing worth knowing:** the bundled
 * PDF, the date announcement and the seat count all read the *entitlement*,
 * while the day reminder reads a *SessionRegistration* joined to an active
 * entitlement. An entitlement alone would silently leave these buyers out of
 * reminders — the one email with a joining link in it — so this writes both.
 *
 * Writes per buyer, in one transaction: the user (if absent), a PAID order with
 * its item, a CAPTURED payment, an ACTIVE PURCHASE entitlement, and a session
 * registration. It sends nothing: these people were confirmed by hand when they
 * paid, and a confirmation arriving weeks later would read as a second charge.
 *
 * Usage — dry run first, which is the default and writes nothing:
 *
 *   npm run db:backfill:session-buyers -- --session <product-slug> --file buyers.json
 *   npm run db:backfill:session-buyers -- --session <product-slug> --file buyers.json --commit
 *
 * Safe to re-run: a buyer who already holds an active entitlement for the
 * session is skipped whole, so a partial run can simply be run again.
 */

/**
 * Same logic as `normalisePhone` in `live-session.service.ts` — strip
 * non-digits, prepend `91` when it looks like a bare Indian mobile. Keeps
 * backfilled numbers indistinguishable from numbers typed into the website's
 * registration form.
 */
function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.length === 10 ? `91${digits}` : digits;
}

interface BuyerInput {
  /** As it should appear in emails addressed to them. */
  name: string;
  /**
   * The address they will sign in with. Google sign-in attaches to an existing
   * account by email when Google says the address is verified, so this is what
   * joins the row created here to the account they eventually use. If they sign
   * in with a *different* address, they get a second, empty account instead —
   * which is why these must be confirmed with each buyer, not assumed.
   */
  email: string;
  /** Digits with country code (919876543210). Stored on the registration. */
  whatsappNumber?: string;
  exam: (typeof EXAM_OPTIONS)[number];
  stage: (typeof STAGE_OPTIONS)[number];
  /** What they actually paid, in paise. */
  amountMinor: number;
  /** `pay_...` from the Razorpay dashboard. Lets a later refund there revoke access. */
  razorpayPaymentId?: string;
  /** ISO date of the payment. Defaults to now, which only affects reporting. */
  paidAt?: string;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const commit = args.includes('--commit');
  const slug = valueOf(args, '--session');
  const file = valueOf(args, '--file');

  if (!slug || !file) {
    throw new Error(
      'Usage: --session <product-slug> --file <buyers.json> [--commit]\n' +
        'Without --commit nothing is written.',
    );
  }

  const prisma = new PrismaClient();

  try {
    const buyers = parseBuyers(file);

    const product = await prisma.product.findFirst({
      where: { slug, deletedAt: null },
      select: {
        id: true,
        title: true,
        type: true,
        currency: true,
        liveSession: { select: { productId: true } },
      },
    });

    if (!product) throw new Error(`No product with slug "${slug}"`);
    if (!product.liveSession) throw new Error(`Product "${slug}" is not a live session`);

    const student = await prisma.role.findUnique({ where: { key: 'STUDENT' }, select: { id: true } });
    if (!student) throw new Error('No STUDENT role — seed the database first');

    console.log(`\nSession: ${product.title} (${slug})`);
    console.log(commit ? 'Mode:    COMMIT — rows will be written\n' : 'Mode:    DRY RUN — nothing will be written\n');

    let created = 0;
    let skipped = 0;

    for (const buyer of buyers) {
      const existingUser = await prisma.user.findUnique({
        where: { email: buyer.email },
        select: { id: true, name: true },
      });

      if (existingUser) {
        const seat = await prisma.entitlement.findFirst({
          where: {
            userId: existingUser.id,
            productId: product.id,
            status: EntitlementStatus.ACTIVE,
          },
          select: { id: true },
        });

        if (seat) {
          console.log(`  skip    ${buyer.email} — already holds a seat`);
          skipped += 1;
          continue;
        }
      }

      if (!commit) {
        console.log(
          `  would  ${buyer.email} — ${existingUser ? `attach to existing account (${existingUser.name})` : 'create account'}` +
            `, order ₹${(buyer.amountMinor / 100).toFixed(2)}, entitlement, registration`,
        );
        created += 1;
        continue;
      }

      await prisma.$transaction(async (tx) => {
        const userId =
          existingUser?.id ??
          (
            await tx.user.create({
              data: {
                email: buyer.email,
                name: buyer.name,
                // Left unverified on purpose: nothing here proves they control
                // the address. Google sets it when they first sign in.
                emailVerifiedAt: null,
                // `phone` is deliberately not written. Every path that sets it
                // verifies it first, and an unverified number in a UNIQUE
                // column would block the real owner from claiming it later.
                // The number they gave belongs on the registration instead.
                roles: { create: { roleId: student.id } },
              },
              select: { id: true },
            })
          ).id;

        const [sequence] = await tx.$queryRaw<{ nextval: bigint }[]>`
          SELECT nextval('order_number_seq') AS nextval
        `;
        const orderNumber = `JSMF-${new Date().getFullYear()}-${String(sequence.nextval).padStart(6, '0')}`;
        const amount = BigInt(buyer.amountMinor);
        const paidAt = buyer.paidAt ? new Date(buyer.paidAt) : new Date();
        const phone = buyer.whatsappNumber ? normalisePhone(buyer.whatsappNumber) : null;

        const order = await tx.order.create({
          data: {
            orderNumber,
            userId,
            status: OrderStatus.PAID,
            // orders_total_is_consistent: total = subtotal - discount + tax.
            subtotalAmountMinor: amount,
            discountAmountMinor: 0n,
            taxAmountMinor: 0n,
            totalAmountMinor: amount,
            currency: product.currency,
            customerEmail: buyer.email,
            customerPhone: phone,
            paidAt,
            // Says plainly why this order has no checkout behind it, for
            // whoever finds it in support six months from now.
            notes: {
              backfill: 'razorpay-payment-page',
              razorpayPaymentId: buyer.razorpayPaymentId ?? null,
              backfilledAt: new Date().toISOString(),
            } as Prisma.InputJsonValue,
            items: {
              create: {
                productId: product.id,
                productTitleSnapshot: product.title,
                productTypeSnapshot: product.type,
                unitPriceAmountMinor: amount,
                quantity: 1,
                totalAmountMinor: amount,
              },
            },
          },
          select: { id: true },
        });

        // Recorded so a refund issued in the Razorpay dashboard still finds its
        // way back here and revokes the seat: that path looks the payment up by
        // provider payment id. Without it the refund would be invisible.
        await tx.payment.create({
          data: {
            orderId: order.id,
            provider: PaymentProvider.RAZORPAY,
            // Null: there is no JSMF-created provider order behind a Payment
            // Page purchase, and inventing one would make the settlement code
            // believe it created something it did not.
            providerOrderId: null,
            providerPaymentId: buyer.razorpayPaymentId ?? null,
            status: PaymentStatus.CAPTURED,
            amountMinor: amount,
            currency: product.currency,
            capturedAt: paidAt,
          },
        });

        await tx.entitlement.create({
          data: {
            userId,
            productId: product.id,
            source: EntitlementSource.PURCHASE,
            sourceOrderId: order.id,
            status: EntitlementStatus.ACTIVE,
            grantedAt: paidAt,
          },
        });

        await tx.sessionRegistration.create({
          data: {
            liveSessionId: product.liveSession!.productId,
            userId,
            whatsappNumber: phone,
            exam: buyer.exam,
            stage: buyer.stage,
            orderId: order.id,
            // Marked as already confirmed: they were told by hand when they
            // paid. Null here would be a standing invitation for some future
            // sweep to "finish the job" and email them weeks late.
            confirmationSentAt: paidAt,
          },
        });

        console.log(`  done    ${buyer.email} — ${orderNumber}`);
      });

      created += 1;
    }

    console.log(
      `\n${commit ? 'Backfilled' : 'Would backfill'} ${created} buyer(s); skipped ${skipped} already seated.`,
    );
    if (!commit && created > 0) console.log('Re-run with --commit to write.\n');
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Every row is validated before anything is written, so a typo in the last
 * entry cannot leave the first four half-applied with the operator guessing
 * which.
 */
function parseBuyers(file: string): BuyerInput[] {
  const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(parsed)) throw new Error(`${file} must contain a JSON array`);

  const seen = new Set<string>();

  return parsed.map((raw, index) => {
    const buyer = raw as BuyerInput;
    const at = `entry ${index + 1}`;

    if (!buyer.name?.trim()) throw new Error(`${at}: name is required`);
    if (!buyer.email?.trim()) throw new Error(`${at}: email is required`);

    const email = buyer.email.trim().toLowerCase();
    if (seen.has(email)) throw new Error(`${at}: ${email} appears twice`);
    seen.add(email);

    if (!EXAM_OPTIONS.includes(buyer.exam)) {
      throw new Error(`${at}: exam must be one of ${EXAM_OPTIONS.join(', ')}`);
    }
    if (!STAGE_OPTIONS.includes(buyer.stage)) {
      throw new Error(`${at}: stage must be one of ${STAGE_OPTIONS.join(', ')}`);
    }
    if (!Number.isInteger(buyer.amountMinor) || buyer.amountMinor < 0) {
      throw new Error(`${at}: amountMinor must be a whole number of paise`);
    }
    if (buyer.whatsappNumber && !/^\d{10,15}$/.test(buyer.whatsappNumber)) {
      throw new Error(`${at}: whatsappNumber must be digits with country code, e.g. 919876543210`);
    }
    if (buyer.paidAt && Number.isNaN(Date.parse(buyer.paidAt))) {
      throw new Error(`${at}: paidAt is not a valid date`);
    }

    return { ...buyer, email, name: buyer.name.trim() };
  });
}

function valueOf(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
