import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import type { AuthenticatedUser } from '../../identity/application/auth.service';
import { MentorshipBookingService } from '../application/mentorship-booking.service';
import { MentorshipOfferingService } from '../application/mentorship-offering.service';
import { MENTORSHIP_EXAM_OPTIONS } from '../domain/options';
import { HoldSlotDto, RescheduleDto, SlotRangeQueryDto } from './dto/mentorship.dto';

const range = (query: SlotRangeQueryDto) => ({
  from: query.from ? new Date(query.from) : undefined,
  to: query.to ? new Date(query.to) : undefined,
});

/**
 * One-to-one calls on the main website. Reading what is on offer and which
 * times are open is public and carries no personal data; booking needs a
 * signed-in account, like a seat does.
 */
@ApiTags('mentorship')
@Controller('mentorship')
export class MentorshipController {
  constructor(
    private readonly offerings: MentorshipOfferingService,
    private readonly bookings: MentorshipBookingService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Published one-to-one offerings; the first is the one the home page shows' })
  list() {
    return this.offerings.listPublished();
  }

  // Declared before ':slug', which would otherwise swallow this path.
  @Public()
  @Get('options')
  @ApiOperation({ summary: 'Choices for the "Preparing for" field' })
  options() {
    return { exams: MENTORSHIP_EXAM_OPTIONS };
  }

  @Public()
  @Get(':slug')
  bySlug(@Param('slug') slug: string) {
    return this.offerings.publicBySlug(slug);
  }

  @Public()
  @Get(':slug/slots')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Open times, within the booking window' })
  slots(@Param('slug') slug: string, @Query() query: SlotRangeQueryDto) {
    return this.bookings.publicSlots(slug, range(query));
  }

  @ApiBearerAuth()
  @Post(':slug/bookings')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Hold a slot and start the Razorpay checkout',
    description:
      'Returns the same shape as POST /orders plus bookingId and holdExpiresAt. The price is read ' +
      'from the product; the start must be one the slot list offers.',
  })
  hold(@Param('slug') slug: string, @Body() dto: HoldSlotDto, @CurrentUser() user: AuthenticatedUser) {
    return this.bookings.hold(user.id, slug, dto);
  }
}

/** A signed-in attendee's own bookings. Every route scopes to the caller. */
@ApiTags('mentorship')
@ApiBearerAuth()
@Controller('mentorship-bookings')
export class MentorshipBookingController {
  constructor(private readonly bookings: MentorshipBookingService) {}

  @Get()
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.bookings.mine(user.id);
  }

  @Get(':id')
  one(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.bookings.myBooking(user.id, id);
  }

  @Get(':id/slots')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Open times this booking could move to' })
  slots(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: SlotRangeQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bookings.rescheduleSlots(user.id, id, range(query));
  }

  @Post(':id/reschedule')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  reschedule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RescheduleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bookings.reschedule(user.id, id, dto.startsAt);
  }
}
