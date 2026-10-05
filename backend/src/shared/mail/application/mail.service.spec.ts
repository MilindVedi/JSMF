import { describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../../config/config.module';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  MailProvider,
  type SendMailRequest,
  type SendMailResult,
} from '../domain/mail-provider.port';
import { MailService } from './mail.service';

/**
 * Reply-to is applied centrally, so these cover the one rule that cannot be
 * seen from any single template: every message carries a reachable address,
 * because MAIL_FROM is a no-reply one.
 */

/** Captures what the adapter was actually handed. */
class RecordingProvider extends MailProvider {
  readonly name = 'log' as const;
  readonly sent: SendMailRequest[] = [];

  send(request: SendMailRequest): Promise<SendMailResult> {
    this.sent.push(request);
    return Promise.resolve({ messageId: 'id-1', provider: this.name });
  }
}

const config = {
  get: (key: string) =>
    key === 'MAIL_REPLY_TO' ? 'support@jsmf.me' : key.endsWith('QUOTA') ? 100 : undefined,
} as unknown as AppConfig;

/** Recording is observability; these tests are about what the provider receives. */
const prisma = {
  emailDelivery: { create: vi.fn().mockResolvedValue({}), count: vi.fn().mockResolvedValue(0) },
} as unknown as PrismaService;

function serviceWith() {
  const provider = new RecordingProvider();
  return { provider, mail: new MailService(provider, prisma, config) };
}

const message = { to: { email: 'buyer@example.com' }, subject: 'Hi', text: 'plain' };

describe('MailService reply-to', () => {
  it('points every message at support, since MAIL_FROM cannot be answered', async () => {
    const { provider, mail } = serviceWith();

    await mail.sendBestEffort({ ...message, tag: 'purchase-confirmation' });

    expect(provider.sent[0].replyTo).toEqual({ email: 'support@jsmf.me', name: 'JSMF Support' });
  });

  it('leaves a caller that chose its own reply address alone', async () => {
    const { provider, mail } = serviceWith();
    const ownAddress = { email: 'someone-else@jsmf.me' };

    await mail.sendBestEffort({ ...message, replyTo: ownAddress });

    expect(provider.sent[0].replyTo).toEqual(ownAddress);
  });

  it('changes nothing else about the message', async () => {
    const { provider, mail } = serviceWith();

    await mail.send({ ...message, html: '<p>plain</p>', tag: 'session-reminder' });

    expect(provider.sent[0]).toMatchObject({
      to: { email: 'buyer@example.com' },
      subject: 'Hi',
      text: 'plain',
      html: '<p>plain</p>',
      tag: 'session-reminder',
    });
  });
});
