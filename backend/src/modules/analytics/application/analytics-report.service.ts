import { BadRequestException, Injectable } from '@nestjs/common';
import { JsmfApp, Prisma, ProductType } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { FUNNEL_STEPS } from '../domain/analytics-event';

/** Days are India days: the business, its admins and nearly every visitor are there. */
const TIME_ZONE = 'Asia/Kolkata';
const DEFAULT_DAYS = 14;
const MAX_DAYS = 180;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export interface AnalyticsSummary {
  app: JsmfApp;
  /** Inclusive India-time dates, YYYY-MM-DD. */
  from: string;
  to: string;
  totals: { visitors: number; sessions: number; pageViews: number; events: number };
  daily: Array<{ day: string; visitors: number; pageViews: number }>;
  /** Unique visitors who reached each step at least once in the range. */
  funnel: Array<{ step: string; visitors: number }>;
  /**
   * What the database of record says for the same range — accounts and
   * orders, not browser events. For MAIN, orders are live-session orders.
   */
  server: { usersCreated: number; ordersCreated: number; ordersPaid: number; paidAmountMinor: string };
  topPaths: Array<{ path: string; views: number; visitors: number }>;
  topReferrers: Array<{ referrer: string; visitors: number }>;
  topUtmSources: Array<{ source: string; medium: string | null; visitors: number }>;
  devices: Array<{ deviceType: string; visitors: number }>;
}

/**
 * The admin Analytics page, in one call. Every number is an aggregate; no
 * single visitor's trail is ever returned. Each query is one indexed range
 * scan on (app, occurred_at) or (app, name, occurred_at).
 */
@Injectable()
export class AnalyticsReportService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(query: { from?: string; to?: string; app?: JsmfApp }): Promise<AnalyticsSummary> {
    const app = query.app ?? JsmfApp.MAIN;
    const { from, to } = resolveRange(query.from, query.to);

    // [start, end) as instants: midnight India time on `from`, and on the day after `to`.
    const start = Prisma.sql`((${from}::date)::timestamp AT TIME ZONE ${TIME_ZONE})`;
    const end = Prisma.sql`(((${to}::date) + 1)::timestamp AT TIME ZONE ${TIME_ZONE})`;
    const inRange = Prisma.sql`e.app = ${app}::"JsmfApp" AND e.occurred_at >= ${start} AND e.occurred_at < ${end}`;

    const [totals, daily, funnel, server, topPaths, topReferrers, topUtmSources, devices] = await Promise.all([
      this.prisma.$queryRaw<Array<AnalyticsSummary['totals']>>`
        SELECT count(DISTINCT e.visitor_id)::int AS visitors,
               count(DISTINCT e.session_id)::int AS sessions,
               (count(*) FILTER (WHERE e.name = 'page_view'))::int AS "pageViews",
               count(*)::int AS events
        FROM analytics_events e
        WHERE ${inRange}`,

      this.prisma.$queryRaw<AnalyticsSummary['daily']>`
        WITH days AS (
          SELECT generate_series(${from}::date, ${to}::date, interval '1 day')::date AS day
        ), counted AS (
          SELECT (e.occurred_at AT TIME ZONE ${TIME_ZONE})::date AS day,
                 count(DISTINCT e.visitor_id)::int AS visitors,
                 (count(*) FILTER (WHERE e.name = 'page_view'))::int AS page_views
          FROM analytics_events e
          WHERE ${inRange}
          GROUP BY 1
        )
        SELECT to_char(days.day, 'YYYY-MM-DD') AS day,
               coalesce(counted.visitors, 0)::int AS visitors,
               coalesce(counted.page_views, 0)::int AS "pageViews"
        FROM days LEFT JOIN counted USING (day)
        ORDER BY days.day`,

      this.prisma.$queryRaw<Array<{ step: string; visitors: number }>>`
        SELECT e.name AS step, count(DISTINCT e.visitor_id)::int AS visitors
        FROM analytics_events e
        WHERE ${inRange} AND e.name IN (${Prisma.join([...FUNNEL_STEPS])})
        GROUP BY e.name`,

      this.serverTruth(app, start, end),

      this.prisma.$queryRaw<AnalyticsSummary['topPaths']>`
        SELECT e.path, count(*)::int AS views, count(DISTINCT e.visitor_id)::int AS visitors
        FROM analytics_events e
        WHERE ${inRange} AND e.name = 'page_view'
        GROUP BY e.path
        ORDER BY views DESC, e.path
        LIMIT 10`,

      // Grouped by host: "which sites send people", not which of their pages.
      this.prisma.$queryRaw<AnalyticsSummary['topReferrers']>`
        SELECT split_part(e.referrer, '/', 1) AS referrer, count(DISTINCT e.visitor_id)::int AS visitors
        FROM analytics_events e
        WHERE ${inRange} AND e.name = 'page_view' AND e.referrer IS NOT NULL
        GROUP BY 1
        ORDER BY visitors DESC, referrer
        LIMIT 10`,

      this.prisma.$queryRaw<AnalyticsSummary['topUtmSources']>`
        SELECT e.utm_source AS source, max(e.utm_medium) AS medium, count(DISTINCT e.visitor_id)::int AS visitors
        FROM analytics_events e
        WHERE ${inRange} AND e.utm_source IS NOT NULL
        GROUP BY e.utm_source
        ORDER BY visitors DESC, source
        LIMIT 10`,

      this.prisma.$queryRaw<AnalyticsSummary['devices']>`
        SELECT e.device_type AS "deviceType", count(DISTINCT e.visitor_id)::int AS visitors
        FROM analytics_events e
        WHERE ${inRange}
        GROUP BY e.device_type
        ORDER BY visitors DESC`,
    ]);

    const byStep = new Map(funnel.map((row) => [row.step, row.visitors]));

    return {
      app,
      from,
      to,
      totals: totals[0] ?? { visitors: 0, sessions: 0, pageViews: 0, events: 0 },
      daily,
      funnel: FUNNEL_STEPS.map((step) => ({ step, visitors: byStep.get(step) ?? 0 })),
      server,
      topPaths,
      topReferrers,
      topUtmSources,
      devices,
    };
  }

  /**
   * Accounts and orders from their own tables. An order counts as "for" an app
   * by what it contains: live sessions and one-to-one calls are what the main
   * website sells; every other product type belongs to the store (PYQ plans
   * included, for now).
   */
  private async serverTruth(
    app: JsmfApp,
    start: Prisma.Sql,
    end: Prisma.Sql,
  ): Promise<AnalyticsSummary['server']> {
    // What the main website sells: live sessions and one-to-one calls.
    const mainSite = Prisma.sql`(${ProductType.LIVE_SESSION}::"ProductType", ${ProductType.MENTORSHIP}::"ProductType")`;
    const ofApp =
      app === JsmfApp.MAIN
        ? Prisma.sql`i.product_type_snapshot IN ${mainSite}`
        : Prisma.sql`i.product_type_snapshot NOT IN ${mainSite}`;

    const [row] = await this.prisma.$queryRaw<
      Array<{ usersCreated: number; ordersCreated: number; ordersPaid: number; paidAmountMinor: bigint | null }>
    >`
      WITH app_orders AS (
        SELECT o.id, o.created_at, o.paid_at, o.total_amount_minor
        FROM orders o
        WHERE EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id AND ${ofApp})
          AND (o.created_at >= ${start} OR o.paid_at >= ${start})
      )
      SELECT
        (SELECT count(*)::int FROM users u WHERE u.created_at >= ${start} AND u.created_at < ${end}) AS "usersCreated",
        (SELECT count(*)::int FROM app_orders WHERE created_at >= ${start} AND created_at < ${end}) AS "ordersCreated",
        (SELECT count(*)::int FROM app_orders WHERE paid_at >= ${start} AND paid_at < ${end}) AS "ordersPaid",
        (SELECT sum(total_amount_minor) FROM app_orders WHERE paid_at >= ${start} AND paid_at < ${end}) AS "paidAmountMinor"`;

    return {
      usersCreated: row?.usersCreated ?? 0,
      ordersCreated: row?.ordersCreated ?? 0,
      ordersPaid: row?.ordersPaid ?? 0,
      paidAmountMinor: (row?.paidAmountMinor ?? 0n).toString(),
    };
  }
}

/** India-time today, as YYYY-MM-DD. */
function todayInIndia(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date());
}

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isRealDay(day: string): boolean {
  return DAY.test(day) && new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day;
}

export function resolveRange(fromInput?: string, toInput?: string): { from: string; to: string } {
  for (const value of [fromInput, toInput]) {
    if (value !== undefined && !isRealDay(value)) {
      throw new BadRequestException('Dates must be YYYY-MM-DD');
    }
  }
  const to = toInput ?? (fromInput ? addDays(fromInput, DEFAULT_DAYS - 1) : todayInIndia());
  const from = fromInput ?? addDays(to, -(DEFAULT_DAYS - 1));

  if (from > to) throw new BadRequestException('"from" must not be after "to"');
  const days = (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1;
  if (days > MAX_DAYS) throw new BadRequestException(`A range may cover at most ${MAX_DAYS} days`);

  return { from, to };
}
