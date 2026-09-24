import { Global, Module } from '@nestjs/common';
import { AppConfig } from '../../config/config.module';
import { MailProvider } from './domain/mail-provider.port';
import { LogMailAdapter } from './infrastructure/log-mail.adapter';
import { SmtpMailAdapter } from './infrastructure/smtp-mail.adapter';

/**
 * Email, assembled from configuration — the same shape as storage and payments.
 *
 * Global because email is genuinely cross-cutting: identity needs it for OTPs
 * today, and orders (receipts), entitlements (refund notices) and catalogue
 * (publish notifications) all need it next. Requiring each of those to import a
 * module to send one email would add ceremony without adding isolation.
 *
 * Adding a provider that does not speak SMTP — a vendor HTTP API — means one
 * new class extending `MailProvider`, a value in the `MAIL_DRIVER` union, and a
 * branch below. Nothing that sends an email changes.
 */
@Global()
@Module({
  providers: [
    LogMailAdapter,
    {
      provide: MailProvider,
      useFactory: (config: AppConfig, log: LogMailAdapter): MailProvider =>
        config.get('MAIL_DRIVER') === 'smtp' ? new SmtpMailAdapter(config) : log,
      inject: [AppConfig, LogMailAdapter],
    },
  ],
  exports: [MailProvider],
})
export class MailModule {}
