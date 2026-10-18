import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { actorFrom } from '../../catalog/http/actor';
import type { AuthenticatedUser } from '../../identity/application/auth.service';
import { FeedbackFormsService } from '../application/feedback-forms.service';
import { FeedbackHighlightsService } from '../application/feedback-highlights.service';
import { FeedbackInvitesService } from '../application/feedback-invites.service';
import {
  CreateFeedbackFormDto,
  CreateFeedbackHighlightDto,
  ReplaceFeedbackQuestionsDto,
  SendFeedbackInvitesDto,
  UpdateFeedbackFormDto,
  UpdateFeedbackHighlightDto,
} from './dto/feedback.dto';

/**
 * A session's feedback forms, for the admin panel: build them, send them,
 * read the replies, pick some for the website. Educators too, like the rest
 * of a session's page — except deleting a reply, which is admins only.
 */
@ApiTags('admin: feedback')
@ApiBearerAuth()
@Roles('ADMIN', 'EDUCATOR')
@Controller('admin/sessions/:sessionId/feedback-forms')
export class AdminFeedbackController {
  constructor(
    private readonly forms: FeedbackFormsService,
    private readonly invites: FeedbackInvitesService,
    private readonly highlights: FeedbackHighlightsService,
  ) {}

  @Get()
  @ApiOperation({ summary: "This session's feedback forms, newest first, with reply counts" })
  list(@Param('sessionId', ParseUUIDPipe) sessionId: string) {
    return this.forms.list(sessionId);
  }

  @Post()
  @ApiOperation({
    summary: 'Create a feedback form (as a draft)',
    description: 'Starts from a template (templateKey), a copy of any earlier form (copyFromFormId), or the standard template.',
  })
  create(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() dto: CreateFeedbackFormDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.forms.create(sessionId, dto, actorFrom(user, request));
  }

  @Get(':formId')
  get(@Param('sessionId', ParseUUIDPipe) sessionId: string, @Param('formId', ParseUUIDPipe) formId: string) {
    return this.forms.detail(sessionId, formId);
  }

  @Patch(':formId')
  @ApiOperation({ summary: 'Change settings, or open / close the form' })
  update(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('formId', ParseUUIDPipe) formId: string,
    @Body() dto: UpdateFeedbackFormDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.forms.update(sessionId, formId, dto, actorFrom(user, request));
  }

  @Put(':formId/questions')
  @ApiOperation({
    summary: "Replace the form's questions",
    description: 'The whole list, in order. A removed question that has answers is archived, not deleted.',
  })
  replaceQuestions(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('formId', ParseUUIDPipe) formId: string,
    @Body() dto: ReplaceFeedbackQuestionsDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.forms.replaceQuestions(sessionId, formId, dto.questions, actorFrom(user, request));
  }

  @Delete(':formId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a form nobody has replied to (close it otherwise)' })
  async remove(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('formId', ParseUUIDPipe) formId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    await this.forms.remove(sessionId, formId, actorFrom(user, request));
  }

  @Get(':formId/people')
  @ApiOperation({ summary: 'Every seat holder the form asks: emailed, opened, replied' })
  people(@Param('sessionId', ParseUUIDPipe) sessionId: string, @Param('formId', ParseUUIDPipe) formId: string) {
    return this.invites.people(sessionId, formId);
  }

  @Post(':formId/send')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Email personal links',
    description:
      'Omit userIds for everyone not yet emailed; add includeAlreadyEmailed to remind everyone who has not ' +
      'replied. Nobody who has replied is emailed. Safe to repeat.',
  })
  send(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('formId', ParseUUIDPipe) formId: string,
    @Body() dto: SendFeedbackInvitesDto,
  ) {
    return this.invites.send(sessionId, formId, dto);
  }

  @Get(':formId/results')
  @ApiOperation({ summary: 'Numbers per question, and every reply (anonymous ones without a name)' })
  results(@Param('sessionId', ParseUUIDPipe) sessionId: string, @Param('formId', ParseUUIDPipe) formId: string) {
    return this.forms.results(sessionId, formId);
  }

  @Delete(':formId/responses/:responseId')
  @Roles('ADMIN')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete one reply (spam, a test). Admins only.' })
  async removeResponse(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('formId', ParseUUIDPipe) formId: string,
    @Param('responseId', ParseUUIDPipe) responseId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    await this.forms.removeResponse(sessionId, formId, responseId, actorFrom(user, request));
  }

  @Post(':formId/highlights')
  @ApiOperation({
    summary: 'Show a reply on the website, in one of the feedback sections',
    description: 'Only for a reply whose author agreed. Quote, name and stars default from the reply.',
  })
  createHighlight(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('formId', ParseUUIDPipe) formId: string,
    @Body() dto: CreateFeedbackHighlightDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.highlights.create(sessionId, formId, dto, actorFrom(user, request));
  }

  @Patch(':formId/highlights/:highlightId')
  updateHighlight(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('formId', ParseUUIDPipe) formId: string,
    @Param('highlightId', ParseUUIDPipe) highlightId: string,
    @Body() dto: UpdateFeedbackHighlightDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.highlights.update(sessionId, formId, highlightId, dto, actorFrom(user, request));
  }

  @Delete(':formId/highlights/:highlightId')
  @HttpCode(204)
  async removeHighlight(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('formId', ParseUUIDPipe) formId: string,
    @Param('highlightId', ParseUUIDPipe) highlightId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    await this.highlights.remove(sessionId, formId, highlightId, actorFrom(user, request));
  }
}

/** What a new form can start from: the ready-made templates, and every earlier form. */
@ApiTags('admin: feedback')
@ApiBearerAuth()
@Roles('ADMIN', 'EDUCATOR')
@Controller('admin/feedback')
export class AdminFeedbackLibraryController {
  constructor(private readonly forms: FeedbackFormsService) {}

  @Get('templates')
  @ApiOperation({ summary: 'The ready-made feedback form templates' })
  templates() {
    return this.forms.templates();
  }

  @Get('forms')
  @ApiOperation({ summary: 'Every feedback form on every session, newest first, to import from' })
  importable() {
    return this.forms.importable();
  }
}
