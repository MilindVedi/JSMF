import { Global, Module } from '@nestjs/common';
import { AppConfig } from '../../config/config.module';
import { SmsService } from './application/sms.service';
import { SmsProvider } from './domain/sms-provider.port';
import { LogSmsAdapter } from './infrastructure/log-sms.adapter';
import { Msg91SmsAdapter } from './infrastructure/msg91-sms.adapter';

/**
 * Text messages, assembled from configuration — the same shape as mail,
 * storage and payments.
 *
 * `SMS_DRIVER=none` still binds the log adapter rather than leaving the
 * provider unbound. Nothing would inject a missing provider today, but an
 * optional dependency that is sometimes absent is how a module graph becomes
 * conditional, and a conditional graph is how a deployment fails to start for a
 * reason nobody can reproduce. The switch that actually matters is
 * `SmsService.enabled()`, which is a value rather than a wiring decision.
 *
 * Adding a second provider — a different vendor, or a non-Indian market with no
 * DLT constraint — means one class extending `SmsProvider`, a value in the
 * `SMS_DRIVER` union, and a branch below.
 */
@Global()
@Module({
  providers: [
    LogSmsAdapter,
    {
      provide: SmsProvider,
      useFactory: (config: AppConfig, log: LogSmsAdapter): SmsProvider =>
        config.get('SMS_DRIVER') === 'msg91' ? new Msg91SmsAdapter(config) : log,
      inject: [AppConfig, LogSmsAdapter],
    },
    SmsService,
  ],
  exports: [SmsProvider, SmsService],
})
export class SmsModule {}
