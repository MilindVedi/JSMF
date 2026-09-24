import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from '../../../common/decorators/public.decorator';
import type { AuthenticatedUser, RequestContext, SessionTokens } from '../application/auth.service';
import { OAuthService, type OAuthIntent } from '../application/oauth.service';
import { ExchangeOAuthCodeDto } from './dto/admin-invitation.dto';

/**
 * Google sign-in, shared by every JSMF application.
 *
 * Nothing here is specific to the PDF platform: an application names the
 * front-end it wants the finished session delivered to, that target is checked
 * against `OAUTH_ALLOWED_REDIRECTS`, and the session itself is handed over by a
 * single-use code exchanged over POST rather than tokens in the URL.
 */
@ApiTags('auth: oauth')
@Controller('auth/google')
export class OAuthController {
  constructor(private readonly oauth: OAuthService) {}

  @Public()
  @Get('start')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiQuery({ name: 'redirect', required: false, description: 'Must be in OAUTH_ALLOWED_REDIRECTS.' })
  @ApiQuery({ name: 'intent', required: false, enum: ['user', 'admin'] })
  @ApiQuery({ name: 'invitation', required: false, description: 'Admin invitation token, when intent=admin.' })
  @ApiOperation({ summary: 'Begin Google sign-in (redirects to Google)' })
  async start(
    @Res() response: Response,
    @Query('redirect') redirect?: string,
    @Query('intent') intent?: OAuthIntent,
    @Query('invitation') invitation?: string,
  ): Promise<void> {
    const url = await this.oauth.startGoogle({ redirect, intent, invitation });
    response.redirect(url);
  }

  @Public()
  @Get('callback')
  @ApiOperation({
    summary: "Google's redirect target",
    description:
      'Redirects back to the requesting front-end with a single-use handoff code, which that page exchanges for tokens.',
  })
  async callback(
    @Res() response: Response,
    @Req() request: Request,
    @Query('code') code?: string,
    @Query('state') state?: string,
    @Query('error') error?: string,
  ): Promise<void> {
    // The user declined consent, or Google refused. Not an exception — send
    // them back to the app with a reason rather than showing a JSON 400.
    if (error || !code || !state) {
      this.fail(response, state, error ?? 'Google sign-in was cancelled.');
      return;
    }

    try {
      response.redirect(await this.oauth.completeGoogle({ code, state }, contextOf(request)));
    } catch (caught) {
      this.fail(
        response,
        state,
        caught instanceof Error ? caught.message : 'Google sign-in failed.',
      );
    }
  }

  /** Redirects back to the requesting app when the state proves which one it was. */
  private fail(response: Response, state: string | undefined, reason: string): void {
    const target = this.oauth.failureRedirect(state, reason);

    if (target) {
      response.redirect(target);
      return;
    }

    response.status(HttpStatus.BAD_REQUEST).json({ statusCode: 400, message: reason });
  }

  @Public()
  @Post('exchange')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Exchange the handoff code for a session',
    description: 'Single-use and valid for two minutes.',
  })
  exchange(
    @Body() dto: ExchangeOAuthCodeDto,
    @Req() request: Request,
  ): Promise<{ user: AuthenticatedUser; tokens: SessionTokens }> {
    return this.oauth.exchangeHandoff(dto.code, contextOf(request));
  }
}

function contextOf(request: Request): RequestContext {
  return { ip: request.ip, userAgent: request.headers['user-agent'] };
}
