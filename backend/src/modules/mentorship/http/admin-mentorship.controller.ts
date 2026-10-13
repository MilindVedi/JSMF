import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { actorFrom } from '../../catalog/http/actor';
import type { AuthenticatedUser } from '../../identity/application/auth.service';
import { MentorshipBookingService } from '../application/mentorship-booking.service';
import { MentorshipOfferingService } from '../application/mentorship-offering.service';
import { MentorshipScheduleService } from '../application/mentorship-schedule.service';
import {
  AddExceptionDto,
  AdminBookingsQueryDto,
  AdminRescheduleDto,
  CreateOfferingDto,
  MeetLinkDto,
  ReplaceRulesDto,
  SetBookingStatusDto,
  SlotRangeQueryDto,
  UpdateOfferingDto,
} from './dto/mentorship.dto';

/**
 * Managing one-to-one calls: the offering and its hours, and the bookings.
 * Same roles as live sessions, so Dr. Angad (an educator) can see his calls
 * and add the joining links himself.
 */
@ApiTags('admin: mentorship')
@ApiBearerAuth()
@Roles('ADMIN', 'EDUCATOR')
@Controller('admin/mentorship')
export class AdminMentorshipController {
  constructor(
    private readonly offerings: MentorshipOfferingService,
    private readonly bookings: MentorshipBookingService,
    private readonly schedule: MentorshipScheduleService,
  ) {}

  // --- offerings ---------------------------------------------------------------

  @Get('offerings')
  listOfferings() {
    return this.offerings.listForAdmin();
  }

  @Post('offerings')
  @ApiOperation({ summary: 'Create an offering (as a draft)' })
  create(@Body() dto: CreateOfferingDto, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.offerings.create(dto, actorFrom(user, request));
  }

  @Get('offerings/:id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.offerings.getForAdmin(id);
  }

  @Patch('offerings/:id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOfferingDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.offerings.update(id, dto, actorFrom(user, request));
  }

  @Post('offerings/:id/publish')
  @HttpCode(200)
  publish(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.offerings.publish(id, actorFrom(user, request));
  }

  @Post('offerings/:id/unpublish')
  @HttpCode(200)
  unpublish(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.offerings.unpublish(id, actorFrom(user, request));
  }

  @Put('offerings/:id/rules')
  @ApiOperation({ summary: 'Replace the weekly hours' })
  replaceRules(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplaceRulesDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.offerings.replaceRules(id, dto.rules, actorFrom(user, request));
  }

  @Get('offerings/:id/exceptions')
  exceptions(@Param('id', ParseUUIDPipe) id: string) {
    return this.offerings.listExceptions(id);
  }

  @Post('offerings/:id/exceptions')
  @ApiOperation({ summary: 'Block a date (or part of it), or add an extra window' })
  addException(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddExceptionDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.offerings.addException(id, dto, actorFrom(user, request));
  }

  @Delete('offerings/:id/exceptions/:exceptionId')
  @HttpCode(204)
  async removeException(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('exceptionId', ParseUUIDPipe) exceptionId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    await this.offerings.removeException(id, exceptionId, actorFrom(user, request));
  }

  @Get('offerings/:id/slots')
  @ApiOperation({ summary: 'Preview the open times exactly as visitors see them' })
  async previewSlots(@Param('id', ParseUUIDPipe) id: string, @Query() query: SlotRangeQueryDto) {
    const offering = await this.offerings.getRowOrThrow(id);
    const slots = await this.schedule.openSlots(offering, {
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
    });
    return {
      timezone: offering.timezone,
      slots: slots.map((slot) => ({ startsAt: slot.startsAt.toISOString(), endsAt: slot.endsAt.toISOString() })),
    };
  }

  // --- bookings ----------------------------------------------------------------

  @Get('bookings')
  listBookings(@Query() query: AdminBookingsQueryDto) {
    return this.bookings.listForAdmin(query.view ?? 'upcoming', query.offeringId);
  }

  @Get('bookings/:id')
  getBooking(@Param('id', ParseUUIDPipe) id: string) {
    return this.bookings.getForAdmin(id);
  }

  @Patch('bookings/:id/meet-link')
  @ApiOperation({ summary: 'Set the joining link; the attendee is emailed it' })
  setMeetLink(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MeetLinkDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.bookings.setMeetUrl(id, dto.meetUrl, actorFrom(user, request));
  }

  @Post('bookings/:id/reschedule')
  @HttpCode(200)
  reschedule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminRescheduleDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.bookings.adminReschedule(id, dto.startsAt, actorFrom(user, request));
  }

  @Post('bookings/:id/status')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark completed / no-show, or cancel without a refund' })
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetBookingStatusDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.bookings.setStatus(id, dto.status, dto.reason ?? null, dto.notify ?? true, actorFrom(user, request));
  }
}
