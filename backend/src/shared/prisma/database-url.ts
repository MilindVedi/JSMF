/**
 * How long Prisma waits to open one new database connection before it gives
 * up with P1001 "Can't reach database server". Prisma's own default is 5
 * seconds.
 *
 * Why longer: in production the connection goes through Cloud Run's Cloud SQL
 * connector, and once (2026-11-17 06:15 UTC) that path took a little over 5
 * seconds to hand a new connection to the database, which was healthy and
 * idle. Prisma had already given up, so two scheduled jobs failed with a 500
 * and the server-error alert fired; the next run 5 minutes later was fine.
 * 10 seconds rides out a stall like that.
 *
 * Kept at or below Prisma's `pool_timeout` (10 seconds by default): a query
 * waiting for a connection gives up at that point whatever this says, so
 * raising this further only helps with `pool_timeout` raised in the URL too.
 */
export const DEFAULT_DATABASE_CONNECT_TIMEOUT_SECONDS = 10;

/**
 * The database URL with `connect_timeout` added. A URL that already sets
 * `connect_timeout` keeps its own value — it was put there on purpose.
 */
export function withConnectTimeout(url: string, seconds: number): string {
  if (/[?&]connect_timeout=/i.test(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}connect_timeout=${seconds}`;
}

/**
 * `DATABASE_CONNECT_TIMEOUT_SECONDS` as a number. The env schema has already
 * refused a bad value when the app boots; this fallback is for code that
 * builds a PrismaService without the app (the integration specs).
 */
export function connectTimeoutSeconds(raw: string | undefined): number {
  const value = Number(raw);
  return raw && Number.isInteger(value) && value >= 1 && value <= 60
    ? value
    : DEFAULT_DATABASE_CONNECT_TIMEOUT_SECONDS;
}
