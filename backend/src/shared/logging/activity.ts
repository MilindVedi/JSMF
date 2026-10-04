import type { Logger } from '@nestjs/common';

export type ActivityLevel = 'log' | 'warn' | 'error';

/**
 * One line per thing a person (or the payment provider) did — "registered for
 * a session", "payment settled", "webhook failed" — in a shape that can be
 * searched later rather than read.
 *
 * Every line carries `activity: <event name>` plus the identifiers needed to
 * follow one buyer or one order end to end (userId, orderNumber,
 * providerOrderId…). With LOG_FORMAT=json these land in Cloud Logging as
 * `jsonPayload.activity`, `jsonPayload.orderNumber`, etc., so
 * `jsonPayload.orderNumber="JSMF-2026-000123"` returns the whole story of one
 * purchase.
 *
 * What never goes in: passwords, tokens, OTP codes, signatures, card or UPI
 * details, full payloads. Identifiers and outcomes only.
 */
export function activity(
  logger: Logger,
  event: string,
  fields: Record<string, unknown> = {},
  level: ActivityLevel = 'log',
): void {
  const entry: Record<string, unknown> = { activity: event };
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    // BigInt has no JSON form; money is minor units and fits a string exactly.
    entry[key] = typeof value === 'bigint' ? value.toString() : value;
  }
  logger[level](entry);
}
