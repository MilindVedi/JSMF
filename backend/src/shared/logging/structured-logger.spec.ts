import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { activity } from './activity';
import { StructuredLogger } from './structured-logger';

/**
 * Production logs are only useful if Cloud Logging can filter them, which
 * needs a `severity` it recognises and the activity fields as top-level keys.
 */
describe('StructuredLogger (json)', () => {
  afterEach(() => vi.restoreAllMocks());

  function capture(stream: 'stdout' | 'stderr') {
    const lines: string[] = [];
    vi.spyOn(process[stream], 'write').mockImplementation((chunk: string | Uint8Array) => {
      lines.push(String(chunk));
      return true;
    });
    return lines;
  }

  it('writes an activity as one JSON line with severity and queryable fields', () => {
    const out = capture('stdout');
    const logger = new StructuredLogger('json', false);

    logger.log({ activity: 'payment.settled', orderNumber: 'JSMF-2026-000001', amountMinor: '200' }, 'PaymentService');

    expect(out).toHaveLength(1);
    const entry = JSON.parse(out[0]);
    expect(entry).toMatchObject({
      severity: 'INFO',
      context: 'PaymentService',
      activity: 'payment.settled',
      orderNumber: 'JSMF-2026-000001',
      amountMinor: '200',
    });
    expect(entry.message).toContain('payment.settled');
    expect(entry.message).toContain('orderNumber=JSMF-2026-000001');
  });

  it('maps warn and error to Cloud Logging severities, errors to stderr with the stack', () => {
    const out = capture('stdout');
    const err = capture('stderr');
    const logger = new StructuredLogger('json', false);

    logger.warn('careful', 'Ctx');
    logger.error('broke', 'Error: broke\n    at somewhere', 'Ctx');

    expect(JSON.parse(out[0]).severity).toBe('WARNING');
    const errorEntry = JSON.parse(err[0]);
    expect(errorEntry.severity).toBe('ERROR');
    expect(errorEntry.stack).toContain('at somewhere');
    expect(errorEntry.context).toBe('Ctx');
  });

  it('drops debug lines unless debug is enabled', () => {
    const out = capture('stdout');
    new StructuredLogger('json', false).debug('noise', 'Ctx');
    expect(out).toHaveLength(0);
    new StructuredLogger('json', true).debug('wanted', 'Ctx');
    expect(JSON.parse(out[0]).severity).toBe('DEBUG');
  });

  it('activity() serialises bigint amounts and skips undefined fields', () => {
    const calls: unknown[] = [];
    const logger = { log: (m: unknown) => calls.push(m) } as unknown as Logger;

    activity(logger, 'checkout.started', { amountMinor: 79900n, method: undefined });

    expect(calls[0]).toEqual({ activity: 'checkout.started', amountMinor: '79900' });
  });
});
