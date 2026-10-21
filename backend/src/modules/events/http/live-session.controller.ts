import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import type { AuthenticatedUser } from '../../identity/application/auth.service';
import { LiveSessionService } from '../application/live-session.service';
import { NoSessionTestimonialsService } from '../application/no-session-testimonials.service';
import { EXAM_OPTIONS, STAGE_OPTIONS } from '../domain/session-display';
import { RegisterForSessionDto } from './dto/live-session.dto';

/**
 * The main website's API. Reads are public; registering needs a signed-in
 * account, because the free PDF that comes with a seat is granted to it.
 *
 * No response here carries the joining link. It is emailed to seat holders.
 */
@ApiTags('sessions')
@Controller('sessions')
export class LiveSessionController {
  constructor(
    private readonly sessions: LiveSessionService,
    private readonly noSession: NoSessionTestimonialsService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'The next session, the most recent past one, and testimonials for when none is upcoming' })
  async landing() {
    const [landing, quotesLayout] = await Promise.all([this.sessions.landing(), this.noSession.quotesLayout()]);
    return {
      ...landing,
      // Site-wide, so a session's own feedback and the band between sessions
      // are laid out the same way.
      quotesLayout,
      // Only while nothing is upcoming: otherwise the upcoming session's own
      // testimonials are the band.
      noSessionTestimonials: landing.upcoming ? null : await this.noSession.forWebsite(),
    };
  }

  @Public()
  @Get('registration-options')
  @ApiOperation({ summary: 'Choices for the exam and stage fields' })
  options() {
    return { exams: EXAM_OPTIONS, stages: STAGE_OPTIONS };
  }

  // Declared before ':slug', which would otherwise swallow this path.
  @Public()
  @Get('payment-test')
  @ApiOperation({ summary: 'The cheap session used to test the real checkout end to end' })
  paymentTest() {
    return this.sessions.paymentTestSession();
  }

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'A session by its slug' })
  bySlug(@Param('slug') slug: string) {
    return this.sessions.publicBySlug(slug);
  }

  @ApiBearerAuth()
  @Get(':id/registration')
  @ApiOperation({ summary: 'Whether the signed-in person holds a seat' })
  mine(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.sessions.registrationFor(user.id, id);
  }

  @ApiBearerAuth()
  @Post(':id/register')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Save registration details and start the Razorpay checkout',
    description:
      'Returns the same shape as POST /orders. Payment is confirmed with POST /payments/verify ' +
      'and, authoritatively, by the Razorpay webhook.',
  })
  register(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RegisterForSessionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.sessions.register(user.id, id, dto);
  }
}
