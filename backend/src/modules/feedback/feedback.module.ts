import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { FeedbackAudience } from './application/feedback-audience';
import { FeedbackFormsService } from './application/feedback-forms.service';
import { FeedbackHighlightsService } from './application/feedback-highlights.service';
import { FeedbackInvitesService } from './application/feedback-invites.service';
import { FeedbackResponsesService } from './application/feedback-responses.service';
import { AdminFeedbackController, AdminFeedbackLibraryController } from './http/admin-feedback.controller';
import { FeedbackController } from './http/feedback.controller';

/**
 * Feedback forms on jsmf.me, in place of the Google Form: the admin builds a
 * form per session day, seat holders get a personal link by email when the
 * day ends (or use the shared link in Telegram), and picked replies can show
 * on the website.
 *
 * Depends on events only for SessionShowcase (to put picked replies into the
 * feedback sections) and reads the session tables directly for who holds a
 * seat. Nothing depends on this module: it joins the 5-minute clock through
 * SweepRegistry and the public page through SessionShowcase, so removing it
 * leaves sessions exactly as they were.
 */
@Module({
  imports: [EventsModule],
  controllers: [AdminFeedbackController, AdminFeedbackLibraryController, FeedbackController],
  providers: [
    FeedbackAudience,
    FeedbackFormsService,
    FeedbackInvitesService,
    FeedbackResponsesService,
    FeedbackHighlightsService,
  ],
})
export class FeedbackModule {}
