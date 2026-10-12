import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SKIP_LEGAL_CHECK_KEY } from '../decorators/skip-legal-check.decorator';
import { LegalAcceptanceService } from '../../modules/legal/application/legal-acceptance.service';
import type { AuthenticatedUser } from '../../modules/identity/application/auth.service';

/**
 * Runs after JwtAuthGuard. When LEGAL_ACCEPTANCE_REQUIRED is on, a signed-in
 * user who has not accepted the latest major Terms / Privacy version gets 403
 * with code LEGAL_ACCEPTANCE_REQUIRED, which every app turns into its accept
 * screen. Public routes (no `request.user`) and @SkipLegalCheck routes pass.
 *
 * Enforced here rather than in the apps so it cannot be skipped by calling
 * the API directly.
 */
@Injectable()
export class LegalAcceptanceGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly acceptance: LegalAcceptanceService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.acceptance.enforced) return true;
    if (context.getType() !== 'http') return true;

    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_LEGAL_CHECK_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    const user = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>().user;
    if (!user) return true;

    const pending = await this.acceptance.pending(user.id);
    if (pending.length === 0) return true;

    throw new ForbiddenException({
      statusCode: 403,
      code: 'LEGAL_ACCEPTANCE_REQUIRED',
      message: 'Please accept the updated Terms of Service and Privacy Policy to continue.',
      documents: pending,
    });
  }
}
