import { Controller, HttpCode, Post } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { PaymentReconciliationService } from '../application/reconciliation.service';

/**
 * The external clock's way in — see `PaymentReconciliationService` for why the
 * schedule had to leave the process at all.
 *
 * `@Public` only skips JWT auth; it does not make this endpoint reachable by
 * anyone. The backend's Cloud Run IAM policy grants `roles/run.invoker` to
 * exactly two identities — the frontend's service account (see
 * `pdf-web/src/middleware.ts`, which does the same thing for every `/api/*`
 * call) and, once configured, a Cloud Scheduler service account for this job.
 * Cloud Run verifies that identity token at the platform layer, before the
 * request reaches this container at all, so there is nothing left for the
 * application itself to check. A caller without the right service account
 * never gets here to receive a 401 — Cloud Run answers 403 before NestJS runs.
 *
 * `@SkipThrottle` because this is a trusted, IAM-verified caller on a fixed
 * schedule, and a sweep refused for rate limiting would be a sweep that did
 * not happen — which is the failure this endpoint exists to prevent.
 */
@ApiExcludeController()
@Controller('internal')
export class ReconciliationController {
  constructor(private readonly reconciliation: PaymentReconciliationService) {}

  @Post('reconcile-payments')
  @Public()
  @SkipThrottle()
  // 200 even for a sweep that was skipped or failed internally: Cloud Scheduler
  // retries anything else, and a retry cannot help a sweep that was skipped
  // because the previous one is still running. Real failures are in the logs
  // and in the response body, not in the status code.
  @HttpCode(200)
  async trigger() {
    return this.reconciliation.run('http');
  }
}
