import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { actorFrom } from '../../catalog/http/actor';
import type { AuthenticatedUser } from '../../identity/application/auth.service';
import { LiveSessionNotifications } from '../application/live-session-notifications.service';
import { LiveSessionService } from '../application/live-session.service';
import { SessionDetailsService } from '../application/session-details.service';
import {
  CreateLiveSessionDto,
  ReorderTestimonialsDto,
  SendBundleDto,
  SendSessionDetailsDto,
  UpdateLiveSessionDto,
} from './dto/live-session.dto';

/** A screenshot, not a document — small enough that a wrong file fails fast. */
const TESTIMONIAL_MAX_BYTES = 8 * 1024 * 1024;

@ApiTags('admin: sessions')
@ApiBearerAuth()
@Roles('ADMIN', 'EDUCATOR')
@Controller('admin/sessions')
export class AdminLiveSessionController {
  constructor(
    private readonly sessions: LiveSessionService,
    private readonly notifications: LiveSessionNotifications,
    private readonly details: SessionDetailsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Every session, newest first, with seats taken' })
  list() {
    return this.sessions.listForAdmin();
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.sessions.getForAdmin(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a session (as a draft)' })
  create(
    @Body() dto: CreateLiveSessionDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.sessions.create(dto, actorFrom(user, request));
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLiveSessionDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.sessions.update(id, dto, actorFrom(user, request));
  }

  @Post(':id/publish')
  @HttpCode(200)
  publish(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.sessions.publish(id, actorFrom(user, request));
  }

  @Post(':id/unpublish')
  @HttpCode(200)
  unpublish(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.sessions.unpublish(id, actorFrom(user, request));
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Archive (soft delete). Sold seats stay valid and refundable.' })
  async archive(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    await this.sessions.archive(id, actorFrom(user, request));
  }

  @Get(':id/registrations')
  @ApiOperation({ summary: 'Registrations, with whether each person has paid' })
  registrations(@Param('id', ParseUUIDPipe) id: string) {
    return this.sessions.registrationsForAdmin(id);
  }

  @Get(':id/bundle-deliveries')
  @ApiOperation({
    summary: 'Who has received the material included with this session, and who has not',
    description:
      'For sessions that deliver their included material after the event. Reports each seat ' +
      'holder as PENDING, SENT or FAILED (with the reason), plus whether sending is possible yet.',
  })
  bundleDeliveries(@Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.listBundleDeliveries(id);
  }

  @Post(':id/bundle-deliveries/send')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Send the included material to buyers',
    description:
      'Omit userIds to send to everyone who has not received it yet, which also retries ' +
      'previous failures. Anyone already sent to is skipped, so this is safe to repeat.',
  })
  sendBundle(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SendBundleDto) {
    return this.notifications.releaseBundle(id, { userIds: dto.userIds });
  }


  @Get(':id/details')
  @ApiOperation({
    summary: 'Which seat holders still need the dates, the joining link or the Telegram link',
    description:
      'Per seat holder and per detail: UP_TO_DATE, NOT_SENT, CHANGED (they have an older one) ' +
      'or NOT_SET (the session has none). Counts every email that carried a detail — the ' +
      'confirmation, the reminder, and the details email.',
  })
  sessionDetails(@Param('id', ParseUUIDPipe) id: string) {
    return this.details.overview(id);
  }

  @Post(':id/details/send')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Email seat holders the details they still need',
    description:
      'Each person gets one email with only what they need — never sent, or changed since. ' +
      'Omit userIds for everyone; anyone up to date is skipped, so this is safe to repeat.',
  })
  sendSessionDetails(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendSessionDetailsDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.details.send(id, { userIds: dto.userIds, sentById: admin.id });
  }

  @Post(':id/testimonials')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Add a testimonial screenshot to this session',
    description: 'PNG, JPEG or WebP. Shown on the session page; new ones go to the end.',
  })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: TESTIMONIAL_MAX_BYTES } }))
  addTestimonial(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    if (!file) {
      throw new BadRequestException('No file was uploaded under the field name "file".');
    }

    return this.sessions.addTestimonial(id, file, actorFrom(user, request));
  }

  @Patch(':id/testimonials/reorder')
  @HttpCode(200)
  @ApiOperation({ summary: "Set the testimonials' display order" })
  async reorderTestimonials(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReorderTestimonialsDto) {
    await this.sessions.reorderTestimonials(id, dto.testimonialIds);
  }

  @Delete(':id/testimonials/:testimonialId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove a testimonial, and the stored image with it' })
  async removeTestimonial(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('testimonialId', ParseUUIDPipe) testimonialId: string,
  ) {
    await this.sessions.removeTestimonial(id, testimonialId);
  }
}
