import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../../config/config.module';
import { REPORTED_ERROR_EVENT } from '../../../shared/logging/error-reporting';
import { ClientErrorIntakeService } from './client-error-intake.service';

const BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36';

const batch = (errors = 1) => ({
  app: 'MAIN',
  platform: 'web',
  errors: Array.from({ length: errors }, (_, i) => ({
    kind: 'error',
    name: 'TypeError',
    message: `boom ${i}`,
    stack: `TypeError: boom ${i}\n    at f (https://jsmf.me/a.js:1:1)`,
    page: '/prep-kit',
  })),
});

function service(overrides: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = { CLIENT_ERRORS_ENABLED: true, CLIENT_ERRORS_MAX_PER_MINUTE: 600, ...overrides };
  return new ClientErrorIntakeService({ get: (key: string) => values[key] } as unknown as AppConfig);
}

describe('ClientErrorIntakeService', () => {
  afterEach(() => vi.restoreAllMocks());

  it('logs each error as an Error Reporting event filed under the app, never under the sender’s choice', () => {
    const logged: Record<string, unknown>[] = [];
    vi.spyOn(Logger.prototype, 'error').mockImplementation((entry: unknown) => void logged.push(entry as Record<string, unknown>));

    expect(service().record(batch(2), { userId: 'u-1', userAgent: BROWSER })).toBe(2);

    expect(logged).toHaveLength(2);
    expect(logged[0]).toMatchObject({
      activity: 'client.error',
      '@type': REPORTED_ERROR_EVENT,
      serviceContext: { service: 'jsmf-main-web', version: 'unknown' },
      app: 'MAIN',
      page: '/prep-kit',
      userId: 'u-1',
      context: { user: 'u-1', httpRequest: { url: '/prep-kit' } },
    });
    expect(String(logged[0].message)).toMatch(/^TypeError: boom 0\n {4}at f/);
  });

  it('logs nothing when switched off, for bots, or for junk', () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    expect(service({ CLIENT_ERRORS_ENABLED: false }).record(batch(), { userId: null, userAgent: BROWSER })).toBe(0);
    expect(service().record(batch(), { userId: null, userAgent: 'curl/8.4.0' })).toBe(0);
    expect(service().record(batch(), { userId: null, userAgent: undefined })).toBe(0);
    expect(service().record({ hello: 'world' }, { userId: null, userAgent: BROWSER })).toBe(0);
    expect(error).not.toHaveBeenCalled();
  });

  it('stops at the instance budget and warns once', () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const intake = service({ CLIENT_ERRORS_MAX_PER_MINUTE: 6 });

    expect(intake.record(batch(5), { userId: null, userAgent: BROWSER })).toBe(5);
    expect(intake.record(batch(5), { userId: null, userAgent: BROWSER })).toBe(1);
    expect(intake.record(batch(5), { userId: null, userAgent: BROWSER })).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatchObject({ activity: 'client.errors_dropped' });
  });
});
