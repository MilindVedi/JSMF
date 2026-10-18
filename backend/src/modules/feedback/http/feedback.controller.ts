import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../../../common/decorators/public.decorator';
import { SkipLegalCheck } from '../../../common/decorators/skip-legal-check.decorator';
import type { AuthenticatedUser } from '../../identity/application/auth.service';
import { FeedbackResponsesService } from '../application/feedback-responses.service';
import { SubmitFeedbackDto } from './dto/feedback.dto';

type MaybeSignedIn = Request & { user?: AuthenticatedUser };

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
  @ApiOperation({ summary: 'The form, where the visitor stands with it, and their earlier reply if any' })
  view(@Param('formId', ParseUUIDPipe) formId: string, @Req() request: MaybeSignedIn, @Query('k') token?: string) {
    return this.responses.view(formId, { user: request.user, token });
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
}
