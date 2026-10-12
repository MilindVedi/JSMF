import { readFileSync } from 'node:fs';
import {
  BundleDeliveryMode,
  EntitlementSource,
  EntitlementStatus,
  OrderStatus,
  PaymentProvider,
  PaymentStatus,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { EXAM_OPTIONS, STAGE_OPTIONS } from '../src/modules/events/domain/session-display';
import { normaliseContactPhone } from '../src/shared/sms/domain/contact-phone';

/**
 * Brings people who bought a seat before checkout was built — through the
 * external Razorpay Payment Page, or by paying the UPI id directly — into the
 * platform as ordinary buyers.
 *
 * Those purchases never touched JSMF: the money arrived outside it, so there is
 * no user, no order, and no entitlement here — and every automation that
 * serves attendees reads exactly those rows. Without this, those buyers are
 * invisible to the seat count, to the reminder before each day, to the
 * "Notify attendees" send, and to the bundled PDF whenever it is released.
 *
 * **Both halves are needed, and this is the thing worth knowing:** the bundled
 * PDF, the date announcement and the seat count all read the *entitlement*,
 * while the day reminder reads a *SessionRegistration* joined to an active
 * entitlement. An entitlement alone would silently leave these buyers out of
 * reminders — the one email with a joining link in it — so this writes both.
 *
 * Writes per buyer, in one transaction: the user (if absent), a PAID order with
 * its item, a CAPTURED payment, an ACTIVE PURCHASE entitlement, the session's
 * included items when it grants them at payment (exactly as checkout does),
 * and a session registration. It sends nothing: these people were confirmed by
 * hand when they paid, and a confirmation arriving weeks later would read as a
 * second charge. The dry run warns when one of the regular sweeps would email
 * them within minutes anyway (a reminder, or a deferred PDF release) — the same
 * email every other buyer gets, but worth timing on purpose.
 *
 * Usage — dry run first, which is the default and writes nothing:
 *
 *   npm run db:backfill:session-buyers -- --session <product-slug> --file buyers.json
 *   npm run db:backfill:session-buyers -- --session <product-slug> --file buyers.json --commit
 *
 * Safe to re-run: a buyer who already holds an active entitlement for the
 * session is skipped whole, so a partial run can simply be run again.
 */

/** How the money arrived. Only a Payment Page purchase has a Razorpay payment behind it. */
const PAID_VIA = ['razorpay-payment-page', 'upi-direct'] as const;
type PaidVia = (typeof PAID_VIA)[number];

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
  /**
   * `+919876543210`, or a bare 10-digit Indian mobile. Validated and stored
   * exactly as the website's registration form stores it.
   */
  whatsappNumber?: string;
  exam: (typeof EXAM_OPTIONS)[number];
  stage: (typeof STAGE_OPTIONS)[number];
  /** What they actually paid, in paise. */
  amountMinor: number;
  /** Defaults to `razorpay-payment-page`. */
  paidVia?: PaidVia;
  /**
   * `pay_...` from the Razorpay dashboard — Payment Page buyers only. Lets a
   * later refund there revoke access, as for any website purchase.
   */
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
        liveSession: {
          select: {
            productId: true,
            bundleDeliveryMode: true,
            joinUrl: true,
            days: { select: { startsAt: true, durationMinutes: true } },
          },
        },
        // Same filter checkout grants with (payment.service.ts, settle()).
        bundleItems: {
          where: { child: { deletedAt: null } },
          select: { childProductId: true, child: { select: { title: true } } },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!product) throw new Error(`No product with slug "${slug}"`);
    if (!product.liveSession) throw new Error(`Product "${slug}" is not a live session`);
    const session = product.liveSession;

    const student = await prisma.role.findUnique({ where: { key: 'STUDENT' }, select: { id: true } });
    if (!student) throw new Error('No STUDENT role — seed the database first');

    // Checkout grants included items at payment only in IMMEDIATE mode; the
    // deferred modes release them later to every seat holder, these included.
    const grantsBundleNow = session.bundleDeliveryMode === BundleDeliveryMode.IMMEDIATE;
    const hasBundle = product.bundleItems.length > 0;

    console.log(`\nSession:  ${product.title} (${slug})`);
    console.log(
      `Included: ${
        hasBundle
          ? `${product.bundleItems.map((b) => b.child.title).join(', ')} — ` +
            (grantsBundleNow
              ? 'granted now, as at checkout'
              : `held back (${session.bundleDeliveryMode}), released later to every seat holder`)
          : 'nothing'
      }`,
    );
    for (const warning of imminentEmails(session, grantsBundleNow, hasBundle)) {
      console.log(`WARNING:  ${warning}`);
    }
    console.log(commit ? 'Mode:     COMMIT — rows will be written\n' : 'Mode:     DRY RUN — nothing will be written\n');

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

      // `payments.provider_payment_id` is UNIQUE: a reused id would fail the
      // insert mid-run, so it is caught here, in the dry run too.
      if (buyer.razorpayPaymentId) {
        const taken = await prisma.payment.findUnique({
          where: { providerPaymentId: buyer.razorpayPaymentId },
          select: { order: { select: { orderNumber: true } } },
        });
        if (taken) {
          throw new Error(
            `${buyer.email}: ${buyer.razorpayPaymentId} is already recorded on order ${taken.order.orderNumber}`,
          );
        }
      }

      // Someone who opened the website's form before paying by hand already
      // has a registration row with no seat. It is updated, not duplicated:
      // there is one per person per session.
      const priorRegistration = existingUser
        ? await prisma.sessionRegistration.findUnique({
            where: { liveSessionId_userId: { liveSessionId: session.productId, userId: existingUser.id } },
            select: { id: true },
          })
        : null;

      if (!commit) {
        console.log(
          `  would   ${buyer.email} — ${existingUser ? `attach to existing account (${existingUser.name})` : 'create account'}` +
            `, order ₹${(buyer.amountMinor / 100).toFixed(2)} via ${buyer.paidVia}, entitlement` +
            (grantsBundleNow && hasBundle ? ', included items' : '') +
            (priorRegistration ? ', registration (updating an unfinished one from the website)' : ', registration') +
            (buyer.paidVia === 'razorpay-payment-page' && !buyer.razorpayPaymentId
              ? '\n          note: no razorpayPaymentId — a refund in Razorpay will not take this seat back'
              : ''),
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
                // the address. Nothing reads this flag to decide who is
                // emailed, so it keeps them out of no notification.
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
        const phone = buyer.whatsappNumber ? normaliseContactPhone(buyer.whatsappNumber) : null;

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
              backfill: buyer.paidVia,
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
            // Null: there is no JSMF-created provider order behind these
            // purchases, and inventing one would make the settlement code
            // believe it created something it did not.
            providerOrderId: null,
            providerPaymentId: buyer.razorpayPaymentId ?? null,
            status: PaymentStatus.CAPTURED,
            // A direct UPI transfer never went through Razorpay; this and the
            // order's notes say so, and the admin refund refuses it — there is
            // nothing on Razorpay to refund.
            method: buyer.paidVia === 'upi-direct' ? 'upi' : null,
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

        // Included items, exactly as settle() grants them at checkout: BUNDLE
        // source, tied to this order so a refund takes them back too, and
        // skipped when the buyer already owns one. Silent, like checkout's.
        if (grantsBundleNow) {
          for (const included of product.bundleItems) {
            const owned = await tx.entitlement.findFirst({
              where: { userId, productId: included.childProductId, status: EntitlementStatus.ACTIVE },
              select: { id: true },
            });
            if (owned) continue;

            await tx.entitlement.create({
              data: {
                userId,
                productId: included.childProductId,
                source: EntitlementSource.BUNDLE,
                sourceOrderId: order.id,
                sourceProductId: product.id,
                status: EntitlementStatus.ACTIVE,
                grantedAt: paidAt,
              },
            });
          }
        }

        const registration = {
          exam: buyer.exam,
          stage: buyer.stage,
          orderId: order.id,
          // Marked as already confirmed: they were told by hand when they
          // paid. Null here would be a standing invitation for some future
          // sweep to "finish the job" and email them weeks late.
          confirmationSentAt: paidAt,
        };

        await tx.sessionRegistration.upsert({
          where: { liveSessionId_userId: { liveSessionId: session.productId, userId } },
          create: { liveSessionId: session.productId, userId, whatsappNumber: phone, ...registration },
          // A number already on the unfinished registration is kept when the
          // file has none, the same rule the website's form follows.
          update: { ...registration, ...(phone ? { whatsappNumber: phone } : {}) },
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
 * The regular sweeps treat backfilled buyers like everyone else, which is the
 * point — but two of them would email them within ~5 minutes of the run, and
 * that is worth knowing before committing rather than after.
 */
function imminentEmails(
  session: {
    bundleDeliveryMode: BundleDeliveryMode;
    joinUrl: string | null;
    days: { startsAt: Date; durationMinutes: number }[];
  },
  grantsBundleNow: boolean,
  hasBundle: boolean,
): string[] {
  const warnings: string[] = [];
  const now = Date.now();
  const leadMs = Number(process.env.SESSION_REMINDER_LEAD_MINUTES ?? 60) * 60_000;

  const dayStartingSoon = session.days.some(
    (day) => day.startsAt.getTime() > now && day.startsAt.getTime() - now <= leadMs,
  );
  if (session.joinUrl && dayStartingSoon) {
    warnings.push(
      'a session day starts within the reminder window — the reminder sweep will email them the joining link within ~5 minutes.',
    );
  }

  const ended =
    session.days.length > 0 &&
    session.days.every((day) => day.startsAt.getTime() + day.durationMinutes * 60_000 <= now);
  if (hasBundle && !grantsBundleNow && ended && session.bundleDeliveryMode === BundleDeliveryMode.AUTO_AFTER_SESSION) {
    warnings.push(
      'the session has ended and releases its included items automatically — if they are published, the next sweep will email them "your materials are ready" within ~5 minutes.',
    );
  }

  return warnings;
}

/**
 * Every row is validated before anything is written, so a typo in the last
 * entry cannot leave the first four half-applied with the operator guessing
 * which.
 */
function parseBuyers(file: string): Array<BuyerInput & { paidVia: PaidVia }> {
  const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(parsed)) throw new Error(`${file} must contain a JSON array`);

  const seen = new Set<string>();
  const seenPayments = new Set<string>();

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
    if (buyer.whatsappNumber && !normaliseContactPhone(buyer.whatsappNumber)) {
      throw new Error(`${at}: whatsappNumber must be +<country code><number>, or a 10-digit Indian mobile`);
    }

    const paidVia = buyer.paidVia ?? 'razorpay-payment-page';
    if (!PAID_VIA.includes(paidVia)) {
      throw new Error(`${at}: paidVia must be one of ${PAID_VIA.join(', ')}`);
    }
    if (paidVia === 'upi-direct' && buyer.razorpayPaymentId) {
      throw new Error(`${at}: a direct UPI payment has no razorpayPaymentId`);
    }
    if (buyer.razorpayPaymentId) {
      if (!/^pay_[A-Za-z0-9]+$/.test(buyer.razorpayPaymentId)) {
        throw new Error(`${at}: razorpayPaymentId must look like pay_XXXXXXXX`);
      }
      if (seenPayments.has(buyer.razorpayPaymentId)) {
        throw new Error(`${at}: ${buyer.razorpayPaymentId} appears twice`);
      }
      seenPayments.add(buyer.razorpayPaymentId);
    }
    if (buyer.paidAt && Number.isNaN(Date.parse(buyer.paidAt))) {
      throw new Error(`${at}: paidAt is not a valid date`);
    }

    return { ...buyer, email, name: buyer.name.trim(), paidVia };
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
