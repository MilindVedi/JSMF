import { readFileSync } from 'node:fs';
import { OfflineSaleEntry } from '@prisma/client';
import { AuditService } from '../src/shared/audit/audit.service';
import { PrismaService } from '../src/shared/prisma/prisma.service';
import { EntitlementService } from '../src/modules/entitlements/application/entitlement.service';
import { OfflineSaleHandlers } from '../src/modules/orders/application/offline-sale-handlers';
import { OfflineSaleService } from '../src/modules/orders/application/offline-sale.service';
import { SessionOfflineSaleHandler } from '../src/modules/events/application/session-offline-sale.handler';

/**
 * Records buyers who paid outside checkout — by direct UPI, Razorpay's Payment
 * Page, bank transfer or cash — into a live session, from a terminal.
 *
 * The admin panel does the same thing (Sessions → a session → "Buyers added by
 * hand"), and is the usual way. This is for a long list or when the panel is
 * unavailable. Both run the very same OfflineSaleService, so a file that works
 * here works there, and every buyer added either way appears in that list.
 *
 * Wired by hand instead of booting the API, so it needs only DATABASE_URL —
 * not every secret the API needs to start.
 *
 * The file is a JSON list. Per buyer:
 *
 *   name, email                 required
 *   whatsappNumber              optional — "+919876543210" or a 10-digit Indian mobile
 *   amountPaidMinor             required — what they paid, in paise (₹1,299 = 129900)
 *   discountMinor               optional — what they were let off, in paise
 *   method                      required — RAZORPAY_PAYMENT_PAGE, UPI_DIRECT,
 *                               BANK_TRANSFER, CASH or OTHER
 *   reference                   optional — the Razorpay pay_… id, a UPI reference
 *   paidAt                      required — with its timezone: "2026-10-10T14:30:00+05:30"
 *   note, exam, stage           optional
 *
 * The first version's names still work: amountMinor, paidVia
 * ("upi-direct", "razorpay-payment-page") and razorpayPaymentId.
 *
 * Usage — dry run first, which is the default and writes nothing:
 *
 *   npm run db:backfill:session-buyers -- --session <product-slug> --file buyers.json
 *   npm run db:backfill:session-buyers -- --session <product-slug> --file buyers.json --commit
 *
 * Sends no email. Safe to re-run: anyone who already has a seat is skipped.
 */

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const commit = args.includes('--commit');
  const slug = valueOf(args, '--session');
  const file = valueOf(args, '--file');

  if (!slug || !file) {
    throw new Error('Usage: --session <product-slug> --file <buyers.json> [--commit]\nWithout --commit nothing is written.');
  }

  const prisma = new PrismaService();
  const audit = new AuditService(prisma);
  const entitlements = new EntitlementService(prisma);
  const handlers = new OfflineSaleHandlers();
  const leadMinutes = Number(process.env.SESSION_REMINDER_LEAD_MINUTES ?? 60);
  const config = { get: (key: string) => (key === 'SESSION_REMINDER_LEAD_MINUTES' ? leadMinutes : undefined) } as never;
  new SessionOfflineSaleHandler(prisma, handlers, config).onModuleInit();
  const sales = new OfflineSaleService(prisma, entitlements, handlers, audit);

  try {
    const product = await prisma.product.findFirst({ where: { slug, deletedAt: null }, select: { id: true } });
    if (!product) throw new Error(`No product with slug "${slug}"`);

    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(file, 'utf8'));
    } catch (cause) {
      throw new Error(`${file} is not valid JSON: ${cause instanceof Error ? cause.message : cause}`);
    }

    const preview = await sales.preview(product.id, raw);
    console.log(`\nProduct:  ${preview.product.title} (${slug}) — list price ₹${rupees(preview.product.priceAmountMinor)}`);
    console.log(commit ? 'Mode:     COMMIT — rows will be written\n' : 'Mode:     DRY RUN — nothing will be written\n');

    if (preview.errors.length > 0) {
      for (const error of preview.errors) {
        console.log(`  error   ${error.index >= 0 ? `row ${error.index + 1}` : 'file'} · ${error.field}: ${error.message}`);
      }
      throw new Error(`\n${preview.errors.length} mistake(s) — fix the file; nothing was written.`);
    }

    for (const warning of preview.warnings) console.log(`WARNING:  ${warning}`);
    for (const row of preview.rows) {
      const discount = BigInt(row.discountMinor) > 0n ? ` (₹${rupees(row.discountMinor)} off)` : '';
      const action =
        row.action === 'create' ? 'create account' : row.action === 'attach' ? `attach to "${row.existingName}"` : 'already has a seat';
      console.log(
        `  ${row.action === 'skip' ? 'skip ' : 'would'}   ${row.email} — ${action}, ₹${rupees(row.amountPaidMinor)}${discount} ` +
          `via ${row.method}, paid ${istLabel(row.paidAt)}`,
      );
    }

    if (!commit) {
      console.log('\nRe-run with --commit to write.\n');
      return;
    }

    const result = await sales.record(product.id, raw, { userId: null, entry: OfflineSaleEntry.SCRIPT });
    for (const row of result.recorded) console.log(`  done    ${row.email} — ${row.orderNumber}`);
    for (const row of result.failed) console.log(`  FAILED  ${row.email} — ${row.reason}`);
    console.log(`\nRecorded ${result.recorded.length}; skipped ${result.skipped.length}; failed ${result.failed.length}.\n`);
    if (result.failed.length > 0) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

function rupees(minor: string): string {
  const value = BigInt(minor);
  return `${(value / 100n).toLocaleString('en-IN')}${value % 100n ? `.${String(value % 100n).padStart(2, '0')}` : ''}`;
}

/** "10 Oct 2026, 2:30 pm IST" — to check each payment time by eye before committing. */
function istLabel(iso: string): string {
  return `${new Date(iso).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })} IST`;
}

function valueOf(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
