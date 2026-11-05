import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { activity } from './activity';
import { REPORTED_ERROR_EVENT } from './error-reporting';
import { runWithRequestContext } from './request-context';
import { StructuredLogger } from './structured-logger';

/**
 * Production logs are only useful if Cloud Logging can filter them, which
 * needs a `severity` it recognises and the activity fields as top-level keys —
 * and if one request's lines can be found together, which needs every line to
 * carry that request's id and trace.
 */
describe('StructuredLogger (json)', () => {
  afterEach(() => vi.restoreAllMocks());

  const json = (options: { debug?: boolean; traceProject?: string } = {}) =>
    new StructuredLogger({ format: 'json', debug: options.debug ?? false, traceProject: options.traceProject });

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

    json().log({ activity: 'payment.settled', orderNumber: 'JSMF-2026-000001', amountMinor: '200' }, 'PaymentService');

    expect(out).toHaveLength(1);
    const entry = JSON.parse(out[0]);
    expect(entry).toMatchObject({
      severity: 'INFO',
      logger: 'PaymentService',
      activity: 'payment.settled',
      orderNumber: 'JSMF-2026-000001',
      amountMinor: '200',
    });
    expect(entry.message).toContain('payment.settled');
    expect(entry.message).toContain('orderNumber=JSMF-2026-000001');
  });

  it('maps warn and error to Cloud Logging severities, errors to stderr', () => {
    const out = capture('stdout');
    const err = capture('stderr');
    const logger = json();

    logger.warn('careful', 'Ctx');
    logger.error('broke', 'Error: broke\n    at somewhere', 'Ctx');

    expect(JSON.parse(out[0]).severity).toBe('WARNING');
    const errorEntry = JSON.parse(err[0]);
    expect(errorEntry.severity).toBe('ERROR');
    expect(errorEntry.logger).toBe('Ctx');
  });

  it('shapes an error with a stack as an Error Reporting event, stack in the message', () => {
    const err = capture('stderr');

    json().error('broke', 'Error: broke\n    at somewhere (/app/x.js:1:2)', 'ExceptionsHandler');

    const entry = JSON.parse(err[0]);
    expect(entry['@type']).toBe(REPORTED_ERROR_EVENT);
    expect(entry.serviceContext.service).toBeTruthy();
    expect(entry.message).toBe('Error: broke\n    at somewhere (/app/x.js:1:2)');
    // `context` is Error Reporting's object, never the logger name.
    expect(typeof entry.context === 'object' || entry.context === undefined).toBe(true);
  });

  it('leaves an error without a stack as a plain log line', () => {
    const err = capture('stderr');
    json().error({ activity: 'webhook.failed', reason: 'x' }, 'PaymentService');
    expect(JSON.parse(err[0])['@type']).toBeUndefined();
  });

  it('keeps a message the entry brings itself', () => {
    const err = capture('stderr');
    json().error({ activity: 'client.error', message: 'TypeError: x\n    at y', '@type': REPORTED_ERROR_EVENT });
    expect(JSON.parse(err[0]).message).toBe('TypeError: x\n    at y');
  });

  it('adds the request id, user, and trace of the request being served', () => {
    const out = capture('stdout');
    const logger = json({ traceProject: 'jsmf-prod' });
    let user: string | undefined;

    runWithRequestContext(
      {
        requestId: 'req-1',
        method: 'POST',
        path: '/api/orders',
        trace: { traceId: 'a'.repeat(32), spanId: 'b'.repeat(16), sampled: true },
        userId: () => user,
      },
      () => {
        logger.log('before sign-in');
        user = 'user-9';
        logger.log({ activity: 'checkout.started' });
        logger.log({ activity: 'auth.login', userId: 'someone-else' });
      },
    );

    const [first, second, third] = out.map((line) => JSON.parse(line));
    expect(first).toMatchObject({ requestId: 'req-1', method: 'POST', path: '/api/orders' });
    expect(first.userId).toBeUndefined();
    expect(second).toMatchObject({
      requestId: 'req-1',
      userId: 'user-9',
      'logging.googleapis.com/trace': `projects/jsmf-prod/traces/${'a'.repeat(32)}`,
      'logging.googleapis.com/spanId': 'b'.repeat(16),
      'logging.googleapis.com/trace_sampled': true,
    });
    // The call site's own value wins over the context's.
    expect(third.userId).toBe('someone-else');
  });

  it('writes no trace field without a project, and no request fields outside a request', () => {
    const out = capture('stdout');
    const logger = json();
    runWithRequestContext({ requestId: 'r', trace: { traceId: 'a'.repeat(32), sampled: false } }, () =>
      logger.log('x'),
    );
    logger.log('boot');

    const [inRequest, atBoot] = out.map((line) => JSON.parse(line));
    expect(inRequest.requestId).toBe('r');
    expect(inRequest['logging.googleapis.com/trace']).toBeUndefined();
    expect(atBoot.requestId).toBeUndefined();
  });

  it('drops debug lines unless debug is enabled', () => {
    const out = capture('stdout');
    json().debug('noise', 'Ctx');
    expect(out).toHaveLength(0);
    json({ debug: true }).debug('wanted', 'Ctx');
    expect(JSON.parse(out[0]).severity).toBe('DEBUG');
  });

  it('activity() serialises bigint amounts and skips undefined fields', () => {
    const calls: unknown[] = [];
    const logger = { log: (m: unknown) => calls.push(m) } as unknown as Logger;

    activity(logger, 'checkout.started', { amountMinor: 79900n, method: undefined });

    expect(calls[0]).toEqual({ activity: 'checkout.started', amountMinor: '79900' });
  });
});
