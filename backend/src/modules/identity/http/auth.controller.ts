import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../../../common/decorators/public.decorator';
import { AppConfig } from '../../../config/config.module';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import {
  AuthService,
  type AuthenticatedUser,
  type SessionTokens,
} from '../application/auth.service';
import { JwtKeyProvider } from '../infrastructure/jwt-key-provider';
import { AccountRecoveryService, type CodeIssued } from '../application/account-recovery.service';
import { PhoneSignInService } from '../application/phone-sign-in.service';
import { VerificationDeliveryService } from '../application/verification-delivery.service';
import type { VerificationChannelName } from '../domain/verification-channel.port';
import { contextOf, undeliverableAsHttp } from './delivery-failure.http';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';
import {
  CompleteSignupDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  StartSignupDto,
  VerifyResetCodeDto,
} from './dto/verification.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly keys: JwtKeyProvider,
    private readonly config: AppConfig,
    private readonly recovery: AccountRecoveryService,
    private readonly phone: PhoneSignInService,
    private readonly delivery: VerificationDeliveryService,
  ) {}

  /**
   * Which ways in this deployment offers.
   *
   * Every client asks rather than hardcoding, so switching a method on or off
   * is a server setting that reaches the storefront, the PYQ app and the
   * Flutter app at once — and a client never shows a button whose route
   * answers 404. This is how mobile sign-in stays hidden while it is off.
   */
  @Public()
  @Get('methods')
  @ApiOperation({ summary: 'Sign-in methods this deployment offers' })
  methods(): {
    passwordSignup: boolean;
    google: boolean;
    phone: { enabled: boolean; channels: VerificationChannelName[] };
  } {
    const phoneEnabled = this.phone.enabled();

    return {
      passwordSignup: this.config.get('PASSWORD_SIGNUP_ENABLED'),
      google: this.config.get('GOOGLE_OAUTH_ENABLED'),
      phone: {
        enabled: phoneEnabled,
        channels: phoneEnabled ? this.delivery.available('phone') : [],
      },
    };
  }

  /**
   * Creates the account and starts the session in one call — **no email is
   * sent**, so a signup can never be blocked or failed by the mail quota.
   * There is no verification step to pass before the account works.
   *
   * Gated by `PASSWORD_SIGNUP_ENABLED` (on by default) rather than deleted
   * when it was briefly disabled, because hiding the form while leaving the
   * route open would still let anyone create an account through the API or the
   * Swagger page. It answers 404 rather than 403 when off: a route that is
   * meant not to exist should look like it does not exist.
   */
  @Public()
  @Post('register')
  // Far tighter than the app-wide limit: signup and login are what credential
  // stuffing and enumeration actually target.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Create an account and start a session' })
  async register(
    @Body() dto: RegisterDto,
    @Req() request: Request,
  ): Promise<{ user: AuthenticatedUser; tokens: SessionTokens }> {
    if (!this.config.get('PASSWORD_SIGNUP_ENABLED')) {
      throw new NotFoundException();
    }

    return this.auth.register(dto, contextOf(request));
  }

  /**
   * Signup, step one: sends a code to the address and creates nothing.
   *
   * Split from `register` rather than replacing it. `register` remains the
   * unverified path used by anything that already trusts the address — and
   * keeping both means the verified flow could be turned off in an incident
   * without taking signup down with it.
   */
  @Public()
  @Post('signup/start')
  @HttpCode(HttpStatus.OK)
  // Tighter than login: each call sends an email, so this is the one route
  // where abuse costs real money and burns a quota shared with paying
  // customers' purchase confirmations.
  @Throttle({ default: { limit: 4, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Begin signup by sending a verification code',
    description:
      'Creates no account. On a delivery failure, answers 503 with `reason` and ' +
      '`alternatives` so the client can offer another way in.',
  })
  async startSignup(@Body() dto: StartSignupDto, @Req() request: Request): Promise<CodeIssued> {
    if (!this.config.get('PASSWORD_SIGNUP_ENABLED')) {
      throw new NotFoundException();
    }

    return undeliverableAsHttp(() => this.recovery.startSignup(dto, contextOf(request)));
  }

  /** Signup, step two: the code becomes the account. */
  @Public()
  @Post('signup/verify')
  @HttpCode(HttpStatus.OK)
  // The code is six digits and dies after five wrong guesses, but that is per
  // code; this is what stops someone cycling through fresh ones.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Complete signup with the verification code' })
  async verifySignup(
    @Body() dto: CompleteSignupDto,
    @Req() request: Request,
  ): Promise<{ user: AuthenticatedUser; tokens: SessionTokens }> {
    if (!this.config.get('PASSWORD_SIGNUP_ENABLED')) {
      throw new NotFoundException();
    }

    return this.recovery.completeSignup(dto, contextOf(request));
  }

  /**
   * Sends a password reset code. Answers the same whether or not the address
   * has an account — see the service for why this one route is vague where
   * signup is explicit.
   */
  @Public()
  @Post('password/forgot')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 4, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Send a password reset code',
    description:
      'Always succeeds for an unknown address. On a delivery failure, answers 503 with ' +
      '`reason` and `alternatives`.',
  })
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
    @Req() request: Request,
  ): Promise<CodeIssued> {
    return undeliverableAsHttp(() => this.recovery.startPasswordReset(dto, contextOf(request)));
  }

  /** Checks the reset code without consuming it — the code stays valid. */
  @Public()
  @Post('password/verify-code')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Check a password-reset code without consuming it' })
  async verifyResetCode(@Body() dto: VerifyResetCodeDto): Promise<{ valid: true }> {
    await this.recovery.verifyResetCode(dto);
    return { valid: true };
  }

  /** Sets the new password, revokes every existing session, and signs in. */
  @Public()
  @Post('password/reset')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Set a new password using a reset code' })
  async resetPassword(
    @Body() dto: ResetPasswordDto,
    @Req() request: Request,
  ): Promise<{ user: AuthenticatedUser; tokens: SessionTokens }> {
    return this.recovery.completePasswordReset(dto, contextOf(request));
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Exchange credentials for an access + refresh token pair' })
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
  ): Promise<{ user: AuthenticatedUser; tokens: SessionTokens }> {
    return this.auth.login(dto, contextOf(request));
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Rotate a refresh token',
    description:
      'Single-use. Presenting an already-rotated token is treated as replay and revokes the entire token family.',
  })
  async refresh(@Body() dto: RefreshDto, @Req() request: Request): Promise<SessionTokens> {
    return this.auth.refresh(dto.refreshToken, contextOf(request));
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke the session this refresh token belongs to' })
  async logout(@Body() dto: RefreshDto): Promise<void> {
    await this.auth.logout(dto.refreshToken);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'The currently authenticated user' })
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }

  @Public()
  @Get('jwks')
  @ApiOperation({
    summary: 'Public keys for verifying access tokens',
    description:
      'Lets any other JSMF application verify tokens issued here without being configured with — or trusted with — the private signing key.',
  })
  jwks(): { keys: unknown[] } {
    return this.keys.toJwks();
  }
}
