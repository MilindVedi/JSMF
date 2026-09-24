import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AuthService, type AuthenticatedUser } from '../../modules/identity/application/auth.service';
import { TokenService } from '../../modules/identity/application/token.service';

/**
 * Applied globally: every route requires a valid access token unless it is
 * explicitly marked @Public(). Fail-closed by default — a new endpoint added
 * without thinking about auth is protected, not exposed.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();

    if (isPublic) {
      // Best-effort identification, never enforcement. Some public routes serve
      // both anonymous visitors and signed-in ones and behave differently for
      // each — a free download attributed to the buyer who took it, for
      // instance. Failures are swallowed deliberately: on a public route an
      // expired or malformed token means "treat as anonymous", not 401.
      await this.attachUserIfPossible(request);
      return true;
    }

    const token = extractBearerToken(request.headers.authorization);

    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const claims = await this.tokens.verifyAccessToken(token);

    // The token proves who signed in; it does not prove the account still
    // exists or is still active. Re-reading the user here is what makes
    // suspending an account take effect immediately rather than whenever the
    // current access token happens to expire.
    const user = await this.auth.findAuthenticatedUser(claims.sub);

    if (!user) {
      throw new UnauthorizedException('Account is no longer active');
    }

    request.user = user;
    return true;
  }

  private async attachUserIfPossible(
    request: Request & { user?: AuthenticatedUser },
  ): Promise<void> {
    const token = extractBearerToken(request.headers.authorization);
    if (!token) return;

    try {
      const claims = await this.tokens.verifyAccessToken(token);
      const user = await this.auth.findAuthenticatedUser(claims.sub);
      if (user) request.user = user;
    } catch {
      // Anonymous. Intentionally silent — see above.
    }
  }
}

function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, value] = header.split(' ');
  if (!value || scheme.toLowerCase() !== 'bearer') return null;
  return value.trim() || null;
}
