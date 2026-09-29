import { BadRequestException, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import type { Request } from 'express';
import type { RequestContext } from '../application/auth.service';
import {
  VerificationChannelMismatchError,
  VerificationUndeliverableError,
  type VerificationDeliveryFailure,
} from '../application/verification-delivery.service';
import type { VerificationChannelName } from '../domain/verification-channel.port';

/**
 * Turns an undeliverable code into a response the client can act on.
 *
 * The shape matters more than the status. A bare 503 with a sentence in it
 * forces every client to pattern-match on prose; `reason`, `alternatives` and
 * `otherRoutes` let it decide what to offer without parsing anything, and let
 * that change when a channel is switched on without the client redeploying.
 *
 * The messages name no provider and no quota figure: "our Resend limit is
 * exhausted" or "Meta billing failed" describes JSMF's accounts, not the
 * person's problem.
 *
 * Shared by every controller that sends a code, so the email and mobile flows
 * cannot drift into describing the same failure differently.
 */
export async function undeliverableAsHttp<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (cause) {
    if (cause instanceof VerificationChannelMismatchError) {
      // A client asked for, say, the email channel on a phone flow. The DTOs
      // already prevent it, so reaching here is a tampered request.
      throw new BadRequestException('That delivery method is not available here.');
    }

    if (!(cause instanceof VerificationUndeliverableError)) throw cause;

    const { reason, attempted, alternatives, otherRoutes } = cause.failure;

    throw new ServiceUnavailableException({
      statusCode: HttpStatus.SERVICE_UNAVAILABLE,
      error: 'Verification code undeliverable',
      message: messageFor(cause.failure),
      // The machine-readable half. A client switches on these; the sentence
      // above is only ever displayed.
      reason,
      attempted,
      alternatives,
      otherRoutes,
    });
  }
}

const HOW: Record<VerificationChannelName, string> = {
  email: 'by email',
  whatsapp: 'on WhatsApp',
  sms: 'by SMS',
};

/** Exported for tests. */
export function messageFor(failure: VerificationDeliveryFailure): string {
  const { reason, attempted, alternatives, otherRoutes } = failure;
  const failed = `We couldn't send your code ${HOW[attempted]}`;

  // Same destination, another channel: the cheapest thing to try.
  if (alternatives.length > 0) {
    return `${failed} just now. You can have it sent ${HOW[alternatives[0]]} instead.`;
  }

  // A different route entirely.
  if (otherRoutes.includes('phone')) {
    return `${failed} just now. Please continue with your mobile number instead.`;
  }

  if (otherRoutes.includes('email')) {
    return reason === 'quota'
      ? `${failed} right now. Please try again later, or sign up with your email instead.`
      : `${failed} just now. Please try again in a few minutes, or sign up with your email instead.`;
  }

  // Quota does not clear by retrying in a minute, so do not suggest it.
  return reason === 'quota'
    ? `${failed} right now. Please try again later — signing in with Google works in the meantime.`
    : `${failed} just now. Please try again in a few minutes, or continue with Google.`;
}

export function contextOf(request: Request): RequestContext {
  return {
    ip: request.ip,
    userAgent: request.headers['user-agent'],
  };
}
