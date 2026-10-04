import { Module } from '@nestjs/common';
import { SettingsService } from './application/settings.service';
import { AdminSettingsController } from './http/admin-settings.controller';
import { SettingsController } from './http/settings.controller';

/** Site-wide display toggles — not tied to any one product, session or order. */
@Module({
  controllers: [SettingsController, AdminSettingsController],
  providers: [SettingsService],
})
export class SettingsModule {}
