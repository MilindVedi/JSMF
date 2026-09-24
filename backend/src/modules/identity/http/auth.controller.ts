import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../../../common/decorators/public.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import {
  AuthService,
  type AuthenticatedUser,
  type RequestContext,
  type SessionTokens,
} from '../application/auth.service';
import { JwtKeyProvider } from '../infrastructure/jwt-key-provider';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly keys: JwtKeyProvider,
  ) {}

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
    return this.auth.register(dto, contextOf(request));
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

function contextOf(request: Request): RequestContext {
  return {
    ip: request.ip,
    userAgent: request.headers['user-agent'],
  };
}
