import { describe, expect, it } from 'vitest';
import {
  MAX_BODY_BYTES,
  parseClientErrorBatch,
  reportLocationOf,
  reportMessageOf,
  serviceNameFor,
} from './client-error';
import { WindowBudget } from './window-budget';

const valid = {
  app: 'PYQ',
  platform: 'web',
  release: '2026.10.30-1',
  errors: [
    {
      kind: 'render',
      name: 'TypeError',
      message: "Cannot read properties of undefined (reading 'options')",
      stack: "TypeError: Cannot read properties of undefined (reading 'options')\n    at QuestionCard (https://prep.jsmf.me/_next/static/chunks/a.js:1:2345)",
      page: '/practice/0193e0b4-7c1a-7000-8000-000000000000',
      digest: '2851743129',
      count: 3,
    },
  ],
};

/**
 * The body comes from anyone on the internet. Asserted here: junk is dropped
 * whole or per item, nothing the sender chose decides where the entry is
 * filed, and free text is capped and redacted before it can reach a log.
 */
describe('parseClientErrorBatch', () => {
  it('accepts a well-formed batch, as JSON or as the text/plain string sendBeacon sends', () => {
    for (const body of [valid, JSON.stringify(valid)]) {
      const batch = parseClientErrorBatch(body);
      expect(batch).toMatchObject({ app: 'PYQ', platform: 'web', release: '2026.10.30-1' });
      expect(batch?.errors[0]).toMatchObject({ kind: 'render', name: 'TypeError', count: 3, digest: '2851743129' });
    }
  });

  it('refuses unknown apps, platforms and kinds — the service name comes from a closed list', () => {
    expect(parseClientErrorBatch({ ...valid, app: 'jsmf-backend' })).toBeNull();
    expect(parseClientErrorBatch({ ...valid, platform: 'windows' })).toBeNull();
    expect(parseClientErrorBatch({ ...valid, errors: [{ ...valid.errors[0], kind: 'anything' }] })).toBeNull();
    expect(serviceNameFor('PYQ', 'android')).toBe('jsmf-pyq-android');
  });

  it('drops oversized, unparseable or empty bodies', () => {
    expect(parseClientErrorBatch('x'.repeat(MAX_BODY_BYTES + 1))).toBeNull();
    expect(parseClientErrorBatch('{not json')).toBeNull();
    expect(parseClientErrorBatch({ ...valid, errors: [] })).toBeNull();
    expect(parseClientErrorBatch(null)).toBeNull();
    expect(parseClientErrorBatch([valid])).toBeNull();
  });

  it('keeps at most five errors and drops the bad ones without losing the good', () => {
    const errors = [{ junk: true }, ...Array.from({ length: 9 }, () => valid.errors[0])];
    expect(parseClientErrorBatch({ ...valid, errors })?.errors).toHaveLength(4);
  });

  it('caps and redacts free text, and keeps pages to a pathname', () => {
    const batch = parseClientErrorBatch({
      ...valid,
      release: 'x; rm -rf /',
      errors: [
        {
          kind: 'error',
          name: '<img src=x>',
          message: `reset failed for priya@gmail.com with https://jsmf.me/r?code=999999 ${'y'.repeat(5000)}`,
          stack: Array.from({ length: 200 }, (_, i) => `    at f${i} (https://x.me/a.js?token=abc:1:${i})`).join('\n'),
          page: '/auth/reset?code=999999',
          digest: '../../etc',
          count: 1e9,
        },
      ],
    });
    const error = batch!.errors[0];
    expect(batch!.release).toBeNull();
    expect(error.name).toBe('Error');
    expect(error.message.length).toBeLessThanOrEqual(1000);
    expect(error.message).not.toContain('priya@gmail.com');
    expect(error.message).not.toContain('999999');
    expect(error.stack!.split('\n')).toHaveLength(50);
    expect(error.stack).not.toContain('token=abc');
    expect(error.page).toBe('/auth/reset');
    expect(error.digest).toBeNull();
    expect(error.count).toBe(1000);
  });

  it('refuses pages that are not a site path', () => {
    for (const page of ['https://evil.example/x', '//evil.example', 'relative', '/has space']) {
      expect(parseClientErrorBatch({ ...valid, errors: [{ ...valid.errors[0], page }] })).toBeNull();
    }
  });

  it('flattens a multi-line message so it cannot fake extra log lines', () => {
    const batch = parseClientErrorBatch({
      ...valid,
      errors: [{ ...valid.errors[0], message: 'one\n{"severity":"CRITICAL"}\r\ntwo' }],
    });
    expect(batch!.errors[0].message).toBe('one {"severity":"CRITICAL"} two');
  });
});

describe('Error Reporting shape', () => {
  const error = parseClientErrorBatch(valid)!.errors[0];

  it('uses the stack as the message when it already starts with the error', () => {
    expect(reportMessageOf(error)).toBe(error.stack);
    expect(reportMessageOf({ ...error, stack: null })).toBe(`TypeError: ${error.message}`);
  });

  it('finds the location in V8 and Safari/Firefox frames, else falls back to the page', () => {
    expect(reportLocationOf(error)).toEqual({
      functionName: 'QuestionCard',
      filePath: 'https://prep.jsmf.me/_next/static/chunks/a.js',
      lineNumber: 1,
    });
    expect(reportLocationOf({ ...error, stack: 'render@https://x.me/main.js:12:40' })).toEqual({
      functionName: 'render',
      filePath: 'https://x.me/main.js',
      lineNumber: 12,
    });
    expect(reportLocationOf({ ...error, stack: null })).toEqual({ functionName: 'render', filePath: error.page, lineNumber: 0 });
  });
});

describe('WindowBudget', () => {
  it('grants up to the limit per window, then resets', () => {
    let now = 0;
    const budget = new WindowBudget(5, 60_000, () => now);
    expect(budget.take(3)).toBe(3);
    expect(budget.take(3)).toBe(2);
    expect(budget.take(1)).toBe(0);
    expect(budget.shouldWarn()).toBe(true);
    expect(budget.shouldWarn()).toBe(false);
    now = 60_000;
    expect(budget.take(4)).toBe(4);
  });
});
