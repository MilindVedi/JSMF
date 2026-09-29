import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../../config/config.module';
import { MailDeliveryError, MailQuotaExceededError } from '../domain/mail-provider.port';
import { parseMailbox } from '../domain/mailbox';
import { classify, Msg91MailAdapter, textAsHtml } from './msg91-mail.adapter';

function configWith(overrides: Record<string, string | undefined> = {}) {
  const values: Record<string, string | undefined> = {
    MSG91_AUTH_KEY: 'auth-abc',
    MSG91_EMAIL_TEMPLATE_ID: 'jsmf_passthrough',
    MAIL_FROM: 'JSMF <no-reply@mail.jsmf.me>',
    ...overrides,
  };
  return { get: (key: string) => values[key] } as unknown as AppConfig;
}

function respondWith(status: number, body: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  );
}

afterEach(() => vi.restoreAllMocks());

describe('MSG91 mail adapter', () => {
  it('sends through the pass-through template in the shape MSG91 requires', async () => {
    const fetchMock = respondWith(200, { status: 'success', hasError: false, data: { unique_id: 'u-1' } });

    const result = await new Msg91MailAdapter(configWith()).send({
      to: { email: 'buyer@example.com', name: 'Ananya' },
      subject: 'Your code',
      text: 'plain',
      html: '<p>482913</p>',
    });

    expect(result).toEqual({ messageId: 'u-1', provider: 'msg91' });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://control.msg91.com/api/v5/email/send');
    expect((init.headers as Record<string, string>).authkey).toBe('auth-abc');
    expect(JSON.parse(init.body as string)).toEqual({
      recipients: [
        {
          to: [{ name: 'Ananya', email: 'buyer@example.com' }],
          variables: { subject: 'Your code', body: '<p>482913</p>' },
        },
      ],
      from: { name: 'JSMF', email: 'no-reply@mail.jsmf.me' },
      domain: 'mail.jsmf.me',
      template_id: 'jsmf_passthrough',
    });
  });

  it('uses MSG91_EMAIL_DOMAIN over the MAIL_FROM domain when set', async () => {
    const fetchMock = respondWith(200, { status: 'success', data: { unique_id: 'u' } });
    await new Msg91MailAdapter(configWith({ MSG91_EMAIL_DOMAIN: 'jsmf.me' })).send({
      to: { email: 'a@b.c' },
      subject: 's',
      text: 't',
    });
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string).domain).toBe('jsmf.me');
  });

  it('falls back to escaped plain text when there is no HTML', async () => {
    const fetchMock = respondWith(200, { status: 'success', data: { unique_id: 'u' } });
    await new Msg91MailAdapter(configWith()).send({ to: { email: 'a@b.c' }, subject: 's', text: 'a < b\nnext' });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.recipients[0].variables.body).toBe('a &lt; b<br>next');
  });

  it('treats a 200 that reports an error as a failure, with MSG91\'s wording', async () => {
    respondWith(200, { status: 'fail', hasError: true, errors: { domain: ['Domain is not verified'] } });

    const error = await new Msg91MailAdapter(configWith())
      .send({ to: { email: 'a@b.c' }, subject: 's', text: 't' })
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(MailDeliveryError);
    expect((error as Error).message).toContain('Domain is not verified');
  });

  it('reports a network failure as a delivery error, not a crash', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNRESET'));
    await expect(
      new Msg91MailAdapter(configWith()).send({ to: { email: 'a@b.c' }, subject: 's', text: 't' }),
    ).rejects.toBeInstanceOf(MailDeliveryError);
  });
});

describe('classification', () => {
  it('treats an empty wallet as a quota problem, not an error', () => {
    expect(classify('Insufficient balance', 'msg91')).toBeInstanceOf(MailQuotaExceededError);
    expect(classify('Template not found', 'msg91')).toBeInstanceOf(MailDeliveryError);
  });
});

describe('helpers', () => {
  it.each([
    ['JSMF <no-reply@jsmf.me>', { name: 'JSMF', email: 'no-reply@jsmf.me' }],
    ['"JSMF Team" <no-reply@jsmf.me>', { name: 'JSMF Team', email: 'no-reply@jsmf.me' }],
    ['no-reply@jsmf.me', { email: 'no-reply@jsmf.me' }],
  ])('parses %s', (input, expected) => {
    expect(parseMailbox(input)).toEqual(expected);
  });

  it('escapes text for HTML', () => {
    expect(textAsHtml('"x" & <y>')).toBe('&quot;x&quot; &amp; &lt;y&gt;');
  });
});
