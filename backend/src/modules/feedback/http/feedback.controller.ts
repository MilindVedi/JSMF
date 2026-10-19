import { Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../../../common/decorators/public.decorator';
import { SkipLegalCheck } from '../../../common/decorators/skip-legal-check.decorator';
import type { AuthenticatedUser } from '../../identity/application/auth.service';
import { FeedbackResponsesService } from '../application/feedback-responses.service';
import { SubmitFeedbackDto, SubmitOpenFeedbackDto } from './dto/feedback.dto';

type MaybeSignedIn = Request & { user?: AuthenticatedUser };

const EDIT_KEY_HEADER = 'x-feedback-edit-key';
/**
 * Read at request time, like the analytics route: a decorator is evaluated
 * before configuration is injectable, and reading it at load would depend on
 * when the environment happens to be populated. Validated in config/env.ts,
 * which explains how the number is sized.
 */
const openLinkPerHour = () => Number(process.env.FEEDBACK_OPEN_LINK_PER_HOUR) || 300;

/**
 * The form a student fills in on jsmf.me/feedback/<id>.
 *
 * Public, because the email's personal link works without signing in. The
 * signed-in account is still read when there is one (the shared Telegram
 * link). The legal check is skipped: a student following a feedback link
 * should not first be stopped by a terms screen for an unrelated change.
 */
@ApiTags('feedback')
@Controller('feedback/forms')
export class FeedbackController {
  constructor(private readonly responses: FeedbackResponsesService) {}

  @Public()
  @SkipLegalCheck()
  @Get(':formId')
  @ApiQuery({ name: 'k', required: false, description: "The personal link's token, from the email." })
  @ApiHeader({ name: EDIT_KEY_HEADER, required: false, description: "The open link's browser key, to load its earlier reply." })
  @ApiOperation({ summary: 'The form, where the visitor stands with it, and their earlier reply if any' })
  view(
    @Param('formId', ParseUUIDPipe) formId: string,
    @Req() request: MaybeSignedIn,
    @Query('k') token?: string,
    @Headers(EDIT_KEY_HEADER) editKey?: string,
  ) {
    return this.responses.view(formId, { user: request.user, token, editKey: editKey || undefined });
  }

  @Public()
  @SkipLegalCheck()
  @Post(':formId/response')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Save a reply, or change the earlier one' })
  submit(
    @Param('formId', ParseUUIDPipe) formId: string,
    @Body() dto: SubmitFeedbackDto,
    @Req() request: MaybeSignedIn,
  ) {
    return this.responses.submit(formId, { user: request.user }, dto);
  }

  /**
   * A reply on the no-sign-in link. Its own route, so it gets its own limit:
   * there is no account to count against, only the network address, which a
   * whole hostel or college shares. See FEEDBACK_OPEN_LINK_PER_HOUR for why it
   * is sized well above any real class rather than against expected spam.
   */
  @Public()
  @SkipLegalCheck()
  @Post(':formId/open-response')
  @HttpCode(200)
  @Throttle({ default: { limit: openLinkPerHour, ttl: 3_600_000 } })
  @ApiOperation({ summary: "Save a reply on the form's no-sign-in link, or change this browser's earlier one" })
  submitOpen(@Param('formId', ParseUUIDPipe) formId: string, @Body() dto: SubmitOpenFeedbackDto) {
    return this.responses.submitOpen(formId, dto);
  }
}
