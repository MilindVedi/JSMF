import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { redactSecrets } from './redact';

/**
 * The apps run a copy of these redaction rules before sending a crash report
 * (packages/core, and its copies in main-web and pdf-web). The server's copy
 * is the one that counts, but a client copy that drifts would quietly start
 * sending what it should not. This checks every copy behaves like the server
 * on the same inputs. Skipped where the repository is not fully present
 * (a backend-only checkout or container).
 */
const ROOT = join(__dirname, '../../../..');
const COPIES = [
  'packages/core/src/observability/error-report.ts',
  'main-web/src/lib/observability/error-report.ts',
  'pdf-web/src/lib/observability/error-report.ts',
];

const SAMPLES = [
  'GET https://jsmf.me/auth/reset?code=123456&email=a@b.co failed',
  '    at render (https://prep.jsmf.me/_next/static/chunks/0a1b.js?dpl=dpl_7Hq:1:2345)',
  'token rejected: eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2lnbmF0dXJl',
  '{"password":"hunter22","otp": "482913"} refreshToken=r0t4 statusCode=500',
  'Authorization: Bearer abc.def-ghi_jkl',
  'no account for priya.s+1@gmail.com, OTP sent to +91 98765 43210 / 9876543210',
  'card 4111 1111 1111 1111 declined; key 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
  'fetch /api/files/download?sig=abc#x and a\u001b[31m\u0000 control',
];

describe('client redaction copies match the server', () => {
  for (const copy of COPIES) {
    const path = join(ROOT, copy);
    it.skipIf(!existsSync(path))(copy, () => {
      const client = loadRedactor(readFileSync(path, 'utf8'));
      for (const sample of SAMPLES) expect(client(sample), sample).toBe(redactSecrets(sample));
    });
  }
});

/**
 * Evaluates the copy's RULES table and its redactSecrets on their own — the
 * file is TypeScript for another runtime, so it is not imported whole.
 */
function loadRedactor(source: string): (text: string) => string {
  const rules = source.match(/const RULES[^=]*=\s*(\[[\s\S]*?\n\]);/);
  if (!rules) throw new Error('RULES table not found');
  const table = new Function(`return ${rules[1]};`)() as Array<[RegExp, string]>;
  return (text) => table.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), text);
}
