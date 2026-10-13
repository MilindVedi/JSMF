import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { OrdersModule } from '../orders/orders.module';
import { MentorshipBookingService } from './application/mentorship-booking.service';
import { MentorshipMailer } from './application/mentorship-mailer.service';
import { MentorshipOfferingService } from './application/mentorship-offering.service';
import { MentorshipScheduleService } from './application/mentorship-schedule.service';
import { AdminMentorshipController } from './http/admin-mentorship.controller';
import { MentorshipBookingController, MentorshipController } from './http/mentorship.controller';

/**
 * One-to-one mentorship calls, sold on the main website (jsmf.me).
 *
 * Depends on catalog (an offering is a product) and orders (checkout). Nothing
 * depends on this module: it hears about payments and refunds through
 * OrderEvents and joins the 5-minute clock through SweepRegistry, so removing
 * it never touches payment code or the session reminders.
 */
@Module({
  imports: [CatalogModule, OrdersModule],
  controllers: [MentorshipController, MentorshipBookingController, AdminMentorshipController],
  providers: [MentorshipOfferingService, MentorshipScheduleService, MentorshipBookingService, MentorshipMailer],
})
export class MentorshipModule {}
