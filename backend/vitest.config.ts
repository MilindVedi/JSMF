import { defineConfig } from 'vitest/config';

/**
 * Only the timeout differs from Vitest's defaults.
 *
 * The integration specs run against a real Postgres, in parallel files sharing
 * one database, and a payment or session test does several round trips. The
 * default 5 seconds is met alone but missed under the full suite's load —
 * failing on timing, not on behaviour. 20 seconds still catches a test that
 * is genuinely stuck.
 */
export default defineConfig({
  test: {
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
