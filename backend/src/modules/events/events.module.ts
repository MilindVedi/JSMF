import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { OrdersModule } from '../orders/orders.module';
import { LiveSessionNotifications } from './application/live-session-notifications.service';
import { LiveSessionService } from './application/live-session.service';
import { AdminLiveSessionController } from './http/admin-live-session.controller';
import { LiveSessionController } from './http/live-session.controller';
import { SessionReminderController } from './http/session-reminder.controller';

/**
 * Live sessions: what the main website (jsmf.me) sells.
 *
 * Depends on catalog (a session is a product), orders (checkout) and
 * entitlements (a seat is an entitlement). Nothing depends on this module:
 * orders learns a session was paid for only through OrderEvents, so removing
 * or replacing this module never touches payment code.
 */
@Module({
  imports: [CatalogModule, OrdersModule, EntitlementsModule],
  controllers: [LiveSessionController, AdminLiveSessionController, SessionReminderController],
  providers: [LiveSessionService, LiveSessionNotifications],
})
export class EventsModule {}
