import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';

const TIME_ZONE = 'Asia/Kolkata';
const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** Ten years — enough for "all time" without letting one query scan forever. */
const MAX_DAYS = 3660;
/** Up to this many days the chart is per day; longer ranges are per month. */
const DAILY_UP_TO = 92;

/**
 * What the business sells, as the finance page groups it. Decided per order
 * line from the product type snapshot; PYQ plans are COURSE products marked
 * `pyqSubscription` in their metadata.
 */
export type RevenueStream = 'LIVE_SESSION' | 'MENTORSHIP' | 'STORE' | 'PYQ_PLAN';

/**
 * How the money arrived. RAZORPAY_CHECKOUT is the in-app checkout; the rest
 * are offline sales an admin recorded, by their method. STUB only exists in
 * development; FREE is a ₹0 order (a 100% coupon).
 */
export type RevenueChannel =
  | 'RAZORPAY_CHECKOUT'
  | 'RAZORPAY_PAYMENT_PAGE'
  | 'UPI_DIRECT'
  | 'BANK_TRANSFER'
  | 'CASH'
  | 'OTHER'
  | 'STUB'
  | 'FREE';

/** Money is minor units (paise) as strings: BigInt does not survive JSON. */
export interface FinanceTotals {
  /** What buyers paid for orders paid in the range, after discounts. */
  grossMinor: string;
  /** Coupon discounts given on those orders. */
  discountMinor: string;
  /** Tax included in those orders (zero until GST is charged). */
  taxMinor: string;
  /** Refunds issued in the range, whenever the original sale was. Failed refunds excluded. */
  refundedMinor: string;
  /** The part of `refundedMinor` the provider has not yet confirmed as sent back. */
  refundPendingMinor: string;
  /** gross − refunded. */
  netMinor: string;
  paidOrders: number;
  /** Paid orders that cost the buyer nothing (100% coupons). Included in `paidOrders`. */
  freeOrders: number;
  refunds: number;
  payingBuyers: number;
  /** Buyers whose first ever paid order falls in the range. */
  newBuyers: number;
}

export interface FinanceSummary {
  from: string;
  to: string;
  /** 'day' up to 92 days, otherwise 'month'. */
  bucket: 'day' | 'month';
  totals: FinanceTotals;
  /** The same figures for the equally long period just before; null for "all time". */
  previous: FinanceTotals | null;
  /** Since the first sale, regardless of the range. */
  lifetime: { grossMinor: string; refundedMinor: string; netMinor: string; payingBuyers: number };
  series: Array<{ bucket: string; grossMinor: string; refundedMinor: string; orders: number }>;
  byStream: Array<{ stream: RevenueStream; orders: number; grossMinor: string; refundedMinor: string; netMinor: string }>;
  byChannel: Array<{ channel: RevenueChannel; orders: number; grossMinor: string }>;
  /** RAZORPAY for refunds made through the provider; otherwise the manual method an admin recorded. */
  refundsByMethod: Array<{ method: string; refunds: number; amountMinor: string; pendingMinor: string }>;
  topProducts: Array<{
    productId: string;
    title: string;
    stream: RevenueStream;
    units: number;
    grossMinor: string;
    refundedMinor: string;
    netMinor: string;
  }>;
  coupons: Array<{ code: string; orders: number; discountMinor: string; grossMinor: string }>;
  /** In-app checkout only; offline sales never pass through a checkout. */
  checkout: { started: number; paid: number; abandoned: number; failedPayments: number };
}

const money = (value: bigint | null | undefined) => (value ?? 0n).toString();

/**
 * The admin Finance view: every paid order on every app — live sessions,
 * one-to-one calls, the store, PYQ plans — and every refund, from the orders,
 * payments and refunds tables. Sales are dated by when they were paid,
 * refunds by when the money went back (or, while pending, when they were
 * issued); so "net" for a range is money in minus money out in that range.
 */
@Injectable()
export class FinanceReportService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(query: { from?: string; to?: string; all?: boolean }): Promise<FinanceSummary> {
    const { from, to } = query.all ? await this.allTimeRange() : resolveFinanceRange(query.from, query.to);
    const days = dayCount(from, to);
    const bucket: FinanceSummary['bucket'] = days <= DAILY_UP_TO ? 'day' : 'month';
    const [start, end] = bounds(from, to);

    const previousRange = query.all ? null : { from: addDays(from, -days), to: addDays(from, -1) };

    const [totals, previous, lifetime, series, byStream, byChannel, refundsByMethod, topProducts, coupons, checkout] =
      await Promise.all([
        this.totals(start, end),
        previousRange ? this.totals(...bounds(previousRange.from, previousRange.to)) : Promise.resolve(null),
        this.lifetime(),
        this.series(from, to, start, end, bucket),
        this.byStream(start, end),
        this.byChannel(start, end),
        this.refundsByMethod(start, end),
        this.topProducts(start, end),
        this.coupons(start, end),
        this.checkout(start, end),
      ]);

    return { from, to, bucket, totals, previous, lifetime, series, byStream, byChannel, refundsByMethod, topProducts, coupons, checkout };
  }

  private async totals(start: Prisma.Sql, end: Prisma.Sql): Promise<FinanceTotals> {
    const [row] = await this.prisma.$queryRaw<
      Array<{
        gross: bigint;
        discount: bigint;
        tax: bigint;
        refunded: bigint;
        pending: bigint;
        orders: number;
        free: number;
        refunds: number;
        buyers: number;
        newBuyers: number;
      }>
    >`
      WITH sold AS (${soldLines(start, end)}), ref AS (${refundLines(start, end)}),
      paid AS (
        SELECT DISTINCT order_id, user_id, order_total, order_discount, order_tax FROM sold
      )
      SELECT
        (SELECT coalesce(sum(order_total), 0)::bigint FROM paid) AS gross,
        (SELECT coalesce(sum(order_discount), 0)::bigint FROM paid) AS discount,
        (SELECT coalesce(sum(order_tax), 0)::bigint FROM paid) AS tax,
        (SELECT coalesce(sum(amount), 0)::bigint FROM ref) AS refunded,
        (SELECT coalesce(sum(amount) FILTER (WHERE status = 'PENDING'), 0)::bigint FROM ref) AS pending,
        (SELECT count(*)::int FROM paid) AS orders,
        (SELECT count(*)::int FROM paid WHERE order_total = 0) AS free,
        (SELECT count(DISTINCT refund_id)::int FROM ref) AS refunds,
        (SELECT count(DISTINCT user_id)::int FROM paid) AS buyers,
        (SELECT count(DISTINCT p.user_id)::int FROM paid p
          WHERE NOT EXISTS (
            SELECT 1 FROM orders earlier WHERE earlier.user_id = p.user_id AND earlier.paid_at < ${start}
          )) AS "newBuyers"`;

    return {
      grossMinor: money(row?.gross),
      discountMinor: money(row?.discount),
      taxMinor: money(row?.tax),
      refundedMinor: money(row?.refunded),
      refundPendingMinor: money(row?.pending),
      netMinor: ((row?.gross ?? 0n) - (row?.refunded ?? 0n)).toString(),
      paidOrders: row?.orders ?? 0,
      freeOrders: row?.free ?? 0,
      refunds: row?.refunds ?? 0,
      payingBuyers: row?.buyers ?? 0,
      newBuyers: row?.newBuyers ?? 0,
    };
  }

  private async lifetime(): Promise<FinanceSummary['lifetime']> {
    const [row] = await this.prisma.$queryRaw<Array<{ gross: bigint; refunded: bigint; buyers: number }>>`
      SELECT
        (SELECT coalesce(sum(total_amount_minor), 0)::bigint FROM orders WHERE paid_at IS NOT NULL) AS gross,
        (SELECT coalesce(sum(amount_minor), 0)::bigint FROM refunds WHERE status <> 'FAILED') AS refunded,
        (SELECT count(DISTINCT user_id)::int FROM orders WHERE paid_at IS NOT NULL) AS buyers`;
    const gross = row?.gross ?? 0n;
    const refunded = row?.refunded ?? 0n;
    return {
      grossMinor: gross.toString(),
      refundedMinor: refunded.toString(),
      netMinor: (gross - refunded).toString(),
      payingBuyers: row?.buyers ?? 0,
    };
  }

  private async series(
    from: string,
    to: string,
    start: Prisma.Sql,
    end: Prisma.Sql,
    bucket: FinanceSummary['bucket'],
  ): Promise<FinanceSummary['series']> {
    const unit = Prisma.raw(`'${bucket}'`);
    const rows = await this.prisma.$queryRaw<Array<{ bucket: string; gross: bigint; refunded: bigint; orders: number }>>`
      WITH buckets AS (
        SELECT generate_series(date_trunc(${unit}, ${from}::date), ${to}::date, ('1 ' || ${unit})::interval)::date AS bucket
      ),
      sold AS (
        SELECT date_trunc(${unit}, o.paid_at AT TIME ZONE ${TIME_ZONE})::date AS bucket,
               sum(o.total_amount_minor)::bigint AS gross, count(*)::int AS orders
        FROM orders o
        WHERE o.paid_at >= ${start} AND o.paid_at < ${end}
        GROUP BY 1
      ),
      ref AS (
        SELECT date_trunc(${unit}, coalesce(r.processed_at, r.created_at) AT TIME ZONE ${TIME_ZONE})::date AS bucket,
               sum(r.amount_minor)::bigint AS refunded
        FROM refunds r
        WHERE r.status <> 'FAILED'
          AND coalesce(r.processed_at, r.created_at) >= ${start} AND coalesce(r.processed_at, r.created_at) < ${end}
        GROUP BY 1
      )
      SELECT to_char(b.bucket, 'YYYY-MM-DD') AS bucket,
             coalesce(sold.gross, 0)::bigint AS gross,
             coalesce(ref.refunded, 0)::bigint AS refunded,
             coalesce(sold.orders, 0)::int AS orders
      FROM buckets b LEFT JOIN sold USING (bucket) LEFT JOIN ref USING (bucket)
      ORDER BY b.bucket`;
    return rows.map((row) => ({
      bucket: row.bucket,
      grossMinor: money(row.gross),
      refundedMinor: money(row.refunded),
      orders: row.orders,
    }));
  }

  private async byStream(start: Prisma.Sql, end: Prisma.Sql): Promise<FinanceSummary['byStream']> {
    const rows = await this.prisma.$queryRaw<
      Array<{ stream: RevenueStream; orders: number; gross: bigint; refunded: bigint }>
    >`
      WITH sold AS (${soldLines(start, end)}), ref AS (${refundLines(start, end)}),
      s AS (SELECT stream, count(DISTINCT order_id)::int AS orders, sum(collected)::bigint AS gross FROM sold GROUP BY stream),
      r AS (SELECT stream, sum(amount)::bigint AS refunded FROM ref GROUP BY stream)
      SELECT stream, coalesce(s.orders, 0)::int AS orders,
             coalesce(s.gross, 0)::bigint AS gross, coalesce(r.refunded, 0)::bigint AS refunded
      FROM s FULL JOIN r USING (stream)`;
    return rows
      .map((row) => ({
        stream: row.stream,
        orders: row.orders,
        grossMinor: money(row.gross),
        refundedMinor: money(row.refunded),
        netMinor: (row.gross - row.refunded).toString(),
      }))
      .sort((a, b) => Number(BigInt(b.grossMinor) - BigInt(a.grossMinor)));
  }

  private async byChannel(start: Prisma.Sql, end: Prisma.Sql): Promise<FinanceSummary['byChannel']> {
    const rows = await this.prisma.$queryRaw<Array<{ channel: RevenueChannel; orders: number; gross: bigint }>>`
      SELECT
        CASE
          WHEN os.method IS NOT NULL THEN os.method::text
          WHEN o.total_amount_minor = 0 THEN 'FREE'
          WHEN pay.provider = 'STUB' THEN 'STUB'
          ELSE 'RAZORPAY_CHECKOUT'
        END AS channel,
        count(*)::int AS orders,
        sum(o.total_amount_minor)::bigint AS gross
      FROM orders o
      LEFT JOIN offline_sales os ON os.order_id = o.id
      LEFT JOIN LATERAL (
        SELECT p.provider FROM payments p
        WHERE p.order_id = o.id AND p.status IN ('CAPTURED', 'REFUNDED')
        ORDER BY p.captured_at DESC NULLS LAST
        LIMIT 1
      ) pay ON true
      WHERE o.paid_at >= ${start} AND o.paid_at < ${end}
      GROUP BY 1
      ORDER BY gross DESC, orders DESC`;
    return rows.map((row) => ({ channel: row.channel, orders: row.orders, grossMinor: money(row.gross) }));
  }

  private async refundsByMethod(start: Prisma.Sql, end: Prisma.Sql): Promise<FinanceSummary['refundsByMethod']> {
    const rows = await this.prisma.$queryRaw<Array<{ method: string; refunds: number; amount: bigint; pending: bigint }>>`
      SELECT coalesce(r.manual_method::text, 'RAZORPAY') AS method,
             count(*)::int AS refunds,
             sum(r.amount_minor)::bigint AS amount,
             coalesce(sum(r.amount_minor) FILTER (WHERE r.status = 'PENDING'), 0)::bigint AS pending
      FROM refunds r
      WHERE r.status <> 'FAILED'
        AND coalesce(r.processed_at, r.created_at) >= ${start} AND coalesce(r.processed_at, r.created_at) < ${end}
      GROUP BY 1
      ORDER BY amount DESC`;
    return rows.map((row) => ({
      method: row.method,
      refunds: row.refunds,
      amountMinor: money(row.amount),
      pendingMinor: money(row.pending),
    }));
  }

  private async topProducts(start: Prisma.Sql, end: Prisma.Sql): Promise<FinanceSummary['topProducts']> {
    const rows = await this.prisma.$queryRaw<
      Array<{ productId: string; title: string; stream: RevenueStream; units: number; gross: bigint; refunded: bigint }>
    >`
      WITH sold AS (${soldLines(start, end)}), ref AS (${refundLines(start, end)}),
      s AS (
        SELECT product_id, max(title) AS title, max(stream) AS stream,
               sum(quantity)::int AS units, sum(collected)::bigint AS gross
        FROM sold GROUP BY product_id
      ),
      r AS (SELECT product_id, max(title) AS title, max(stream) AS stream, sum(amount)::bigint AS refunded FROM ref GROUP BY product_id)
      SELECT product_id::text AS "productId",
             coalesce(s.title, r.title) AS title,
             coalesce(s.stream, r.stream) AS stream,
             coalesce(s.units, 0)::int AS units,
             coalesce(s.gross, 0)::bigint AS gross,
             coalesce(r.refunded, 0)::bigint AS refunded
      FROM s FULL JOIN r USING (product_id)
      ORDER BY coalesce(s.gross, 0) - coalesce(r.refunded, 0) DESC, units DESC
      LIMIT 10`;
    return rows.map((row) => ({
      productId: row.productId,
      title: row.title,
      stream: row.stream,
      units: row.units,
      grossMinor: money(row.gross),
      refundedMinor: money(row.refunded),
      netMinor: (row.gross - row.refunded).toString(),
    }));
  }

  private async coupons(start: Prisma.Sql, end: Prisma.Sql): Promise<FinanceSummary['coupons']> {
    const rows = await this.prisma.$queryRaw<Array<{ code: string; orders: number; discount: bigint; gross: bigint }>>`
      SELECT c.code::text AS code, count(*)::int AS orders,
             sum(o.discount_amount_minor)::bigint AS discount,
             sum(o.total_amount_minor)::bigint AS gross
      FROM orders o JOIN coupons c ON c.id = o.coupon_id
      WHERE o.paid_at >= ${start} AND o.paid_at < ${end}
      GROUP BY c.code
      ORDER BY discount DESC, orders DESC
      LIMIT 10`;
    return rows.map((row) => ({
      code: row.code,
      orders: row.orders,
      discountMinor: money(row.discount),
      grossMinor: money(row.gross),
    }));
  }

  private async checkout(start: Prisma.Sql, end: Prisma.Sql): Promise<FinanceSummary['checkout']> {
    const [row] = await this.prisma.$queryRaw<Array<FinanceSummary['checkout']>>`
      SELECT
        count(*)::int AS started,
        (count(*) FILTER (WHERE o.paid_at IS NOT NULL))::int AS paid,
        (count(*) FILTER (WHERE o.paid_at IS NULL))::int AS abandoned,
        (SELECT count(*)::int FROM payments p
          WHERE p.status = 'FAILED' AND p.created_at >= ${start} AND p.created_at < ${end}) AS "failedPayments"
      FROM orders o
      WHERE o.created_at >= ${start} AND o.created_at < ${end}
        AND NOT EXISTS (SELECT 1 FROM offline_sales os WHERE os.order_id = o.id)`;
    return row ?? { started: 0, paid: 0, abandoned: 0, failedPayments: 0 };
  }

  /** From the first paid order's India day (or today, if there is none) to today. */
  private async allTimeRange(): Promise<{ from: string; to: string }> {
    const to = todayInIndia();
    const [row] = await this.prisma.$queryRaw<Array<{ first: string | null }>>`
      SELECT to_char(min(paid_at AT TIME ZONE ${TIME_ZONE}), 'YYYY-MM-DD') AS first FROM orders WHERE paid_at IS NOT NULL`;
    const first = row?.first ?? to;
    return { from: dayCount(first, to) > MAX_DAYS ? addDays(to, -(MAX_DAYS - 1)) : first, to };
  }
}

/**
 * Which stream an order line belongs to, from the line's product type
 * snapshot (and, for PYQ plans, the product's metadata). Needs `i` (order
 * line) and `pr` (product) in scope.
 */
const STREAM = Prisma.sql`
  CASE
    WHEN i.product_type_snapshot = 'LIVE_SESSION' THEN 'LIVE_SESSION'
    WHEN i.product_type_snapshot = 'MENTORSHIP' THEN 'MENTORSHIP'
    WHEN pr.metadata->>'pyqSubscription' = 'true' THEN 'PYQ_PLAN'
    ELSE 'STORE'
  END`;

/**
 * One row per line of every order paid in [start, end). `collected` is the
 * line's share of what the buyer actually paid: the order total split across
 * its lines by their list totals, so discounts land where they were taken.
 * The order-level figures are repeated on each line; take them DISTINCT.
 */
function soldLines(start: Prisma.Sql, end: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`
    SELECT o.id AS order_id, o.user_id,
           o.total_amount_minor AS order_total,
           o.discount_amount_minor AS order_discount,
           o.tax_amount_minor AS order_tax,
           i.product_id, i.product_title_snapshot AS title, i.quantity,
           ${STREAM} AS stream,
           CASE
             WHEN sum(i.total_amount_minor) OVER (PARTITION BY o.id) = 0
               THEN o.total_amount_minor / count(*) OVER (PARTITION BY o.id)
             ELSE o.total_amount_minor * i.total_amount_minor / sum(i.total_amount_minor) OVER (PARTITION BY o.id)
           END::bigint AS collected
    FROM orders o
    JOIN order_items i ON i.order_id = o.id
    JOIN products pr ON pr.id = i.product_id
    WHERE o.paid_at >= ${start} AND o.paid_at < ${end}`;
}

/**
 * One row per (refund, order line) for refunds that went back, or are on
 * their way back, in [start, end) — dated by when the money moved, or by when
 * the refund was issued while it is still pending. A refund is split across
 * its order's lines the same way the payment was.
 */
function refundLines(start: Prisma.Sql, end: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`
    SELECT r.id AS refund_id, r.status::text AS status,
           i.product_id, i.product_title_snapshot AS title,
           ${STREAM} AS stream,
           CASE
             WHEN sum(i.total_amount_minor) OVER (PARTITION BY r.id) = 0
               THEN r.amount_minor / count(*) OVER (PARTITION BY r.id)
             ELSE r.amount_minor * i.total_amount_minor / sum(i.total_amount_minor) OVER (PARTITION BY r.id)
           END::bigint AS amount
    FROM refunds r
    JOIN order_items i ON i.order_id = r.order_id
    JOIN products pr ON pr.id = i.product_id
    WHERE r.status <> 'FAILED'
      AND coalesce(r.processed_at, r.created_at) >= ${start}
      AND coalesce(r.processed_at, r.created_at) < ${end}`;
}

/** [start, end) as instants: midnight India time on `from`, and on the day after `to`. */
function bounds(from: string, to: string): [Prisma.Sql, Prisma.Sql] {
  return [
    Prisma.sql`((${from}::date)::timestamp AT TIME ZONE ${TIME_ZONE})`,
    Prisma.sql`(((${to}::date) + 1)::timestamp AT TIME ZONE ${TIME_ZONE})`,
  ];
}

function todayInIndia(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date());
}

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dayCount(from: string, to: string): number {
  return (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1;
}

function isRealDay(day: string): boolean {
  return DAY.test(day) && new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day;
}

export function resolveFinanceRange(fromInput?: string, toInput?: string): { from: string; to: string } {
  for (const value of [fromInput, toInput]) {
    if (value !== undefined && !isRealDay(value)) throw new BadRequestException('Dates must be YYYY-MM-DD');
  }
  const to = toInput ?? todayInIndia();
  const from = fromInput ?? addDays(to, -29);
  if (from > to) throw new BadRequestException('"from" must not be after "to"');
  if (dayCount(from, to) > MAX_DAYS) throw new BadRequestException(`A range may cover at most ${MAX_DAYS} days`);
  return { from, to };
}
