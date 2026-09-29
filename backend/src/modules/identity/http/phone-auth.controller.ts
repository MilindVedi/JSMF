import { Body, Controller, HttpCode, HttpStatus, NotFoundException, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import type { AuthenticatedUser, SessionTokens } from '../application/auth.service';
import {
  PhoneSignInService,
  type PhoneCodeIssued,
  type PhoneVerification,
} from '../application/phone-sign-in.service';
import { contextOf, undeliverableAsHttp } from './delivery-failure.http';
import { RegisterPhoneDto, StartPhoneDto, VerifyPhoneDto } from './dto/phone.dto';

/**
 * Mobile-number sign-in, sign-up, and adding a number to an account.
 *
 * Every route answers **404 while `PHONE_SIGNIN_ENABLED` is off**, not just the
 * buttons being hidden — a flow that is meant not to exist yet should not be
 * reachable through the API or the Swagger page either, and 404 rather than
 * 403 because a switched-off route should look absent, not forbidden.
 *
 * Throttles are tighter than the email routes: every code sent here is paid
 * for, per message. The per-IP limit here and the per-number limit in the
 * service cover the two shapes abuse takes.
 */
@ApiTags('auth')
@Controller('auth')
export class PhoneAuthController {
  constructor(private readonly phone: PhoneSignInService) {}

  @Public()
  @Post('phone/start')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Send a sign-in code to a mobile number',
    description:
      'Same response whether or not the number has an account. On a delivery failure, ' +
      'answers 503 with `alternatives` (e.g. `sms`) and `otherRoutes`.',
  })
  start(@Body() dto: StartPhoneDto, @Req() request: Request): Promise<PhoneCodeIssued> {
    this.ensureEnabled();
    return undeliverableAsHttp(() => this.phone.start(dto, contextOf(request)));
  }

  @Public()
  @Post('phone/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Exchange the code for a session, or for a registration token if the number is new',
  })
  verify(@Body() dto: VerifyPhoneDto, @Req() request: Request): Promise<PhoneVerification> {
    this.ensureEnabled();
    return this.phone.verify(dto, contextOf(request));
  }

  @Public()
  @Post('phone/register')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Create the account for a verified new number' })
  register(
    @Body() dto: RegisterPhoneDto,
    @Req() request: Request,
  ): Promise<{ user: AuthenticatedUser; tokens: SessionTokens }> {
    this.ensureEnabled();
    return this.phone.register(dto, contextOf(request));
  }

  @Post('me/phone/start')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({ summary: 'Send a code to a number to add it to the signed-in account' })
  startLink(
    @Body() dto: StartPhoneDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<PhoneCodeIssued> {
    this.ensureEnabled();
    return undeliverableAsHttp(() =>
      this.phone.startLink({ userId: user.id, phone: dto.phone, channel: dto.channel }, contextOf(request)),
    );
  }

  @Post('me/phone/verify')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Confirm the code and add the number to the account' })
  completeLink(
    @Body() dto: VerifyPhoneDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AuthenticatedUser> {
    this.ensureEnabled();
    return this.phone.completeLink({ userId: user.id, phone: dto.phone, code: dto.code });
  }

  private ensureEnabled(): void {
    if (!this.phone.enabled()) throw new NotFoundException();
  }
}
