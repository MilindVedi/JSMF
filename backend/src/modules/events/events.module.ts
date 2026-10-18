import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { OrdersModule } from '../orders/orders.module';
import { StorageModule } from '../storage/storage.module';
import { LiveSessionNotifications } from './application/live-session-notifications.service';
import { LiveSessionService } from './application/live-session.service';
import { SessionDetailsService } from './application/session-details.service';
import { SessionMaterialsService } from './application/session-materials.service';
import { SessionTestimonialSectionsService } from './application/session-testimonial-sections.service';
import { SessionOfflineSaleHandler } from './application/session-offline-sale.handler';
import { SessionShowcase } from './application/session-showcase';
import { AdminLiveSessionController } from './http/admin-live-session.controller';
import { LiveSessionController } from './http/live-session.controller';
import { SessionReminderController } from './http/session-reminder.controller';

/**
 * Live sessions: what the main website (jsmf.me) sells.
 *
 * Depends on catalog (a session is a product), orders (checkout) and
 * entitlements (a seat is an entitlement). Orders does not depend on this
 * module: it learns a session was paid for only through OrderEvents, so
 * removing or replacing this module never touches payment code.
 *
 * The one module that does depend on it is feedback, and only through the
 * exported SessionShowcase (it puts picked replies into the feedback
 * sections). Nothing here imports feedback.
 */
@Module({
  imports: [CatalogModule, OrdersModule, EntitlementsModule, StorageModule],
  controllers: [LiveSessionController, AdminLiveSessionController, SessionReminderController],
  providers: [
    LiveSessionService,
    LiveSessionNotifications,
    SessionDetailsService,
    SessionMaterialsService,
    SessionTestimonialSectionsService,
    SessionOfflineSaleHandler,
    SessionShowcase,
  ],
  exports: [SessionShowcase],
})
export class EventsModule {}
