import { Global, Module } from '@nestjs/common';
import { AppConfig } from '../../config/config.module';
import { WhatsAppService } from './application/whatsapp.service';
import { WhatsAppProvider } from './domain/whatsapp-provider.port';
import { LogWhatsAppAdapter } from './infrastructure/log-whatsapp.adapter';
import { MetaWhatsAppAdapter } from './infrastructure/meta-whatsapp.adapter';

/**
 * WhatsApp, assembled from configuration. `none` still binds the log adapter
 * so the module graph is identical in every environment — see `SmsModule`.
 *
 * A reseller (MSG91, Gupshup) would be one class extending `WhatsAppProvider`,
 * a value in `WHATSAPP_DRIVER`, and a branch below.
 */
@Global()
@Module({
  providers: [
    LogWhatsAppAdapter,
    {
      provide: WhatsAppProvider,
      useFactory: (config: AppConfig, log: LogWhatsAppAdapter): WhatsAppProvider =>
        config.get('WHATSAPP_DRIVER') === 'meta' ? new MetaWhatsAppAdapter(config) : log,
      inject: [AppConfig, LogWhatsAppAdapter],
    },
    WhatsAppService,
  ],
  exports: [WhatsAppProvider, WhatsAppService],
})
export class WhatsAppModule {}
