import type { MailAddress } from './mail-provider.port';

/**
 * Reads a mailbox written the way `MAIL_FROM` is — `JSMF <no-reply@jsmf.me>`,
 * `"JSMF Team" <no-reply@jsmf.me>`, or a bare `no-reply@jsmf.me` — into its
 * parts.
 *
 * Needed by providers whose API takes the sender as separate fields rather than
 * one header string (MSG91 does; Resend and SMTP accept the string as-is), so
 * `MAIL_FROM` stays one setting whichever driver is active.
 */
export function parseMailbox(value: string): MailAddress {
  const match = /^\s*"?([^"<]*?)"?\s*<\s*([^>\s]+)\s*>\s*$/.exec(value);
  if (match) {
    const name = match[1].trim();
    return name ? { email: match[2], name } : { email: match[2] };
  }
  return { email: value.trim() };
}

/** The part after the `@`, lower-cased — MSG91 sends from a named domain. */
export function mailboxDomain(address: MailAddress): string {
  return address.email.slice(address.email.lastIndexOf('@') + 1).toLowerCase();
}
