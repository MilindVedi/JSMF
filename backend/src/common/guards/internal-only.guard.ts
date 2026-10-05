import { CanActivate, ExecutionContext, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Set by every frontend's middleware (main-web, pdf-web, web) on each request
 * it proxies here. Must match VIA_FRONTEND_HEADER in those middlewares.
 */
export const VIA_FRONTEND_HEADER = 'x-jsmf-via-frontend';

/**
 * Keeps `/internal` jobs reachable only by their scheduler, never through a
 * public frontend.
 *
 * Cloud Run IAM admits two identities: Cloud Scheduler, and the frontends'
 * service account. The frontends proxy `/api/*` for the browser and attach
 * their token to every request — so without this, anyone on the internet could
 * trigger these jobs through them (a confused deputy). The frontends also
 * refuse `/api/internal/*` themselves; this guard is the second lock, so a
 * path trick that gets past their check, or a future frontend that forgets it,
 * still cannot get through.
 *
 * A frontend always sets the header and a caller cannot remove it, so its
 * presence reliably means "came through a frontend". The scheduler, and the
 * local jsmf-cron container, call the backend directly and never send it.
 *
 * Answers 404, not 403: to a caller coming through a frontend this route does
 * not exist.
 */
@Injectable()
export class InternalOnlyGuard implements CanActivate {
  private readonly logger = new Logger(InternalOnlyGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    if (request.headers[VIA_FRONTEND_HEADER] !== undefined) {
      this.logger.warn(`Refused ${request.method} ${request.originalUrl} arriving through a frontend proxy`);
      throw new NotFoundException();
    }

    return true;
  }
}
