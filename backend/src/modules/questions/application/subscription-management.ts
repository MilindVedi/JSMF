import { ConflictException } from '@nestjs/common';
import type { AppConfig } from '../../../config/config.module';

/** The audit trail's actor, as every admin write in this module records it. */
export interface Actor {
  id: string;
  ip?: string | null;
}

/**
 * Refuses unless the deployment allows subscription & pricing management.
 *
 * Called at the top of every write in the plan admin and the subscription
 * settings — in the services, not only the controller, so no future caller
 * can reach a write without passing it. The flag is an environment variable
 * and nothing else: there is no request, setting or role that turns it on.
 */
export function assertSubscriptionManagementEnabled(config: AppConfig): void {
  if (!config.get('SUBSCRIPTION_MANAGEMENT_ENABLED')) {
    throw new ConflictException({
      code: 'SUBSCRIPTION_MANAGEMENT_DISABLED',
      message:
        'Subscription & pricing management is turned off for this deployment. ' +
        'Set SUBSCRIPTION_MANAGEMENT_ENABLED=true on the API to make changes.',
    });
  }
}
