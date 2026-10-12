import { SetMetadata } from '@nestjs/common';

export const SKIP_LEGAL_CHECK_KEY = 'skipLegalCheck';

/**
 * Lets a signed-in user reach a route before accepting the current Terms and
 * Privacy Policy: signing in and out, their own account, and the legal
 * endpoints themselves — everything a user needs to be able to accept.
 */
export const SkipLegalCheck = () => SetMetadata(SKIP_LEGAL_CHECK_KEY, true);
