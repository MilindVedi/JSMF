import { OfflinePaymentMethod } from '@prisma/client';
import { normaliseContactPhone } from '../../../shared/sms/domain/contact-phone';

/**
 * Reads the buyers an admin wants to record as offline sales — from the admin
 * form, an uploaded JSON file, or the terminal script — into one checked shape.
 *
 * One reader for all three, so a file that works in one works in the others.
 * It knows nothing about any product type: fields it does not recognise are
 * passed on as `details`, for the product type's own handler to check (a live
 * session's `exam` and `stage`). That keeps this file unchanged as new product
 * types are sold offline.
 *
 * Pure: no database, and the clock is passed in.
 */

// 200 rows stay well inside the API's default 100 kB request-body limit.
export const MAX_OFFLINE_SALE_ROWS = 200;

export interface OfflineSaleRow {
  /** 0-based position in the list it came from. */
  index: number;
  name: string;
  /** Lower-cased. */
  email: string;
  /** E.164 digits without the plus (`919876543210`), or null. */
  whatsappNumber: string | null;
  /** What the buyer actually paid, in paise. */
  amountPaidMinor: bigint;
  /** What they were let off, in paise. List price = paid + discount. */
  discountMinor: bigint;
  method: OfflinePaymentMethod;
  /** Razorpay `pay_…` id, UPI reference (UTR), cheque number. */
  reference: string | null;
  note: string | null;
  paidAt: Date;
  /** Product-type answers (a session's exam and stage), checked by its handler. */
  details: Record<string, unknown>;
}

export interface OfflineSaleRowError {
  /** 0-based position in the list. */
  index: number;
  field: string;
  message: string;
}

/** The generic fields, and the older names the first script used for some of them. */
const KNOWN_FIELDS = new Set([
  'name',
  'email',
  'whatsappNumber',
  'amountPaidMinor',
  'amountMinor',
  'discountMinor',
  'method',
  'paidVia',
  'reference',
  'razorpayPaymentId',
  'note',
  'paidAt',
  'details',
]);

/** Accepted spellings of each method: the enum name, or the script's kebab-case. */
const METHOD_ALIASES: Record<string, OfflinePaymentMethod> = {
  razorpay_payment_page: OfflinePaymentMethod.RAZORPAY_PAYMENT_PAGE,
  upi_direct: OfflinePaymentMethod.UPI_DIRECT,
  bank_transfer: OfflinePaymentMethod.BANK_TRANSFER,
  cash: OfflinePaymentMethod.CASH,
  other: OfflinePaymentMethod.OTHER,
};

/** ₹1 crore. Far above any real sale; catches a rupee amount typed into a paise field ×100 twice. */
const MAX_AMOUNT_MINOR = 1_000_000_000n;

/**
 * A time with its zone: "2026-10-10T14:30:00+05:30". A bare date would be read
 * as midnight UTC (5:30 am IST), and a time without a zone in whatever zone
 * the machine reading it is in.
 */
const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const RAZORPAY_PAYMENT_ID = /^pay_[A-Za-z0-9]+$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseOfflineSaleRows(
  raw: unknown,
  now: Date,
): { rows: OfflineSaleRow[]; errors: OfflineSaleRowError[] } {
  const errors: OfflineSaleRowError[] = [];

  if (!Array.isArray(raw)) {
    return { rows: [], errors: [{ index: -1, field: 'file', message: 'Expected a list of buyers ([ … ]).' }] };
  }
  if (raw.length === 0) {
    return { rows: [], errors: [{ index: -1, field: 'file', message: 'The list has no buyers.' }] };
  }
  if (raw.length > MAX_OFFLINE_SALE_ROWS) {
    return {
      rows: [],
      errors: [{ index: -1, field: 'file', message: `At most ${MAX_OFFLINE_SALE_ROWS} buyers at a time.` }],
    };
  }

  const rows: OfflineSaleRow[] = [];
  const seenEmails = new Map<string, number>();
  const seenPaymentIds = new Map<string, number>();

  raw.forEach((entry, index) => {
    const fail = (field: string, message: string) => errors.push({ index, field, message });

    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      fail('row', 'Each buyer must be an object ({ … }).');
      return;
    }
    const input = entry as Record<string, unknown>;
    const before = errors.length;

    const name = text(input.name);
    if (!name) fail('name', 'Name is required.');
    else if (name.length > 120) fail('name', 'Name is longer than 120 characters.');

    const email = text(input.email)?.toLowerCase() ?? null;
    if (!email) fail('email', 'Email is required.');
    else if (email.length > 255 || !EMAIL.test(email)) fail('email', `"${email}" is not an email address.`);
    else if (seenEmails.has(email)) fail('email', `${email} is also on row ${seenEmails.get(email)! + 1}.`);
    else seenEmails.set(email, index);

    let whatsappNumber: string | null = null;
    const phone = text(input.whatsappNumber);
    if (phone) {
      whatsappNumber = normaliseContactPhone(phone);
      if (!whatsappNumber) fail('whatsappNumber', 'Use +<country code><number>, or a 10-digit Indian mobile.');
    }

    const amountPaidMinor = money(input.amountPaidMinor ?? input.amountMinor);
    if (amountPaidMinor === undefined) fail('amountPaidMinor', 'Amount paid is required, in paise (₹1,499 = 149900).');
    else if (amountPaidMinor === null) fail('amountPaidMinor', 'Amount paid must be a whole number of paise, 0 or more.');

    const discount = money(input.discountMinor);
    const discountMinor = discount ?? 0n;
    if (discount === null) fail('discountMinor', 'Discount must be a whole number of paise, 0 or more.');

    const methodText = text(input.method ?? input.paidVia);
    const method = methodText ? METHOD_ALIASES[methodText.toLowerCase().replace(/-/g, '_')] : undefined;
    if (!methodText) fail('method', 'How they paid is required.');
    else if (!method) fail('method', `"${methodText}" is not a payment method. Use one of: ${Object.keys(METHOD_ALIASES).join(', ')}.`);

    const reference = text(input.reference ?? input.razorpayPaymentId);
    if (reference && reference.length > 100) fail('reference', 'Reference is longer than 100 characters.');
    if (reference && method === OfflinePaymentMethod.RAZORPAY_PAYMENT_PAGE) {
      if (!RAZORPAY_PAYMENT_ID.test(reference)) {
        fail('reference', 'A Razorpay Payment Page reference is the payment id, like pay_XXXXXXXX.');
      } else if (seenPaymentIds.has(reference)) {
        fail('reference', `${reference} is also on row ${seenPaymentIds.get(reference)! + 1}.`);
      } else {
        seenPaymentIds.set(reference, index);
      }
    }

    const note = text(input.note);
    if (note && note.length > 500) fail('note', 'Note is longer than 500 characters.');

    const paidAtText = text(input.paidAt);
    let paidAt: Date | null = null;
    if (!paidAtText) {
      fail('paidAt', 'Payment date and time is required, e.g. 2026-10-10T14:30:00+05:30.');
    } else if (!ISO_WITH_ZONE.test(paidAtText) || Number.isNaN(Date.parse(paidAtText))) {
      fail('paidAt', `"${paidAtText}" needs a date, a time and a timezone, e.g. 2026-10-10T14:30:00+05:30.`);
    } else {
      paidAt = new Date(paidAtText);
      // A minute of slack for a clock that runs slightly ahead.
      if (paidAt.getTime() > now.getTime() + 60_000) fail('paidAt', 'The payment time is in the future.');
    }

    // Everything not generic belongs to the product type; an explicit
    // `details` object and loose top-level fields (the script's `exam`) merge.
    const details: Record<string, unknown> = {};
    if (input.details !== undefined && input.details !== null) {
      if (typeof input.details !== 'object' || Array.isArray(input.details)) fail('details', 'details must be an object.');
      else Object.assign(details, input.details);
    }
    for (const [key, value] of Object.entries(input)) {
      if (!KNOWN_FIELDS.has(key)) details[key] = value;
    }

    if (errors.length > before) return;

    rows.push({
      index,
      name: name!,
      email: email!,
      whatsappNumber,
      amountPaidMinor: amountPaidMinor!,
      discountMinor,
      method: method!,
      reference: reference ?? null,
      note: note ?? null,
      paidAt: paidAt!,
      details,
    });
  });

  return { rows, errors };
}

/** Trimmed text, or null when absent or blank. Numbers are accepted as text (a phone typed as 9876543210). */
function text(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * Paise from a number or a digit string. `undefined` when absent, `null` when
 * present but not a whole, non-negative, sane amount.
 */
function money(value: unknown): bigint | null | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  let amount: bigint;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) return null;
    amount = BigInt(value);
  } else if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    amount = BigInt(value.trim());
  } else {
    return null;
  }
  return amount < 0n || amount > MAX_AMOUNT_MINOR ? null : amount;
}
