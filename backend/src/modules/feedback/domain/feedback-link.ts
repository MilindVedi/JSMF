import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * The personal link in a feedback email: `<inviteId>.<signature>`.
 *
 * It opens that one person's form without signing in, the way an unsubscribe
 * link does. It is signed rather than stored: the invite's id is public in the
 * link, and only someone holding the key can produce the signature that goes
 * with it, so the database holds no secret worth stealing. The same link stays
 * valid across reminders, so an older email still works after a newer one.
 *
 * What it can do is narrow on purpose: fill in or edit one feedback reply, and
 * only while that person still holds a seat. It does not sign anyone in.
 */

/** Versioned, so a future change of scheme can reject old links on purpose. */
const PURPOSE = 'jsmf-feedback-invite:v1:';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** 192 bits of HMAC-SHA256, base64url: well past guessing, short enough for a URL. */
const SIGNATURE_LENGTH = 32;

export function signInviteToken(inviteId: string, key: string): string {
  return `${inviteId.toLowerCase()}.${signature(inviteId, key)}`;
}

/** The invite id the token was issued for, or null if it was not issued with this key. */
export function readInviteToken(token: string, key: string): string | null {
  const dot = token.indexOf('.');
  if (dot <= 0) return null;

  const inviteId = token.slice(0, dot).toLowerCase();
  const given = Buffer.from(token.slice(dot + 1));
  if (!UUID.test(inviteId)) return null;

  const expected = Buffer.from(signature(inviteId, key));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return inviteId;
}

/**
 * The signing key: FEEDBACK_LINK_SECRET when set, otherwise one derived from
 * the storage signing secret under its own label. Derived keys for different
 * labels are unrelated, so a feedback link can never pass as a download
 * signature or the other way round.
 */
export function feedbackLinkKey(secrets: { dedicated?: string; storageSigningSecret: string }): string {
  if (secrets.dedicated) return secrets.dedicated;
  return createHmac('sha256', secrets.storageSigningSecret).update('jsmf-feedback-link-key').digest('hex');
}

function signature(inviteId: string, key: string): string {
  return createHmac('sha256', key)
    .update(PURPOSE + inviteId.toLowerCase())
    .digest('base64url')
    .slice(0, SIGNATURE_LENGTH);
}
