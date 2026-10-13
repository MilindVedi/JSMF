import { emailSignatureText } from './email-signature';
import {
  button,
  detailTable,
  escapeHtml,
  escapeHtmlMultiline,
  layout,
  type RenderedMail,
} from './mail-templates';

/**
 * The one-to-one call emails. Kept apart from mail-templates.ts so the
 * mentorship module's mail lives in one place, built from the same layout,
 * button and detail-table pieces every other JSMF email uses.
 *
 * Every time shown is pre-formatted by the caller in the offering's timezone
 * ("Wed, 14 Oct 2026 · 7:00 – 7:45 pm IST"), so a template never guesses one.
 */

const P = 'margin:0 0 20px;font-size:15px;line-height:1.55;';
const MUTED = 'margin:0 0 20px;font-size:13px;line-height:1.55;color:#71717a;';

function callBox(title: string, rows: Array<[string, string]>): string {
  return `<div style="margin:0 0 20px;padding:16px;background:#fafafa;border-radius:8px;">
      <p style="margin:0 0 10px;font-size:15px;line-height:1.45;font-weight:600;">${escapeHtml(title)}</p>
      ${detailTable(rows)}
    </div>`;
}

function linkFallback(url: string): string {
  return `<p style="${MUTED}">If the button does not work, paste this into your browser:<br><span style="word-break:break-all;color:#3f3f46;">${escapeHtml(url)}</span></p>`;
}

/**
 * Sent once when the call is paid for. It is the buyer's only confirmation —
 * the generic purchase receipt is skipped — so it carries the receipt facts.
 */
export function mentorshipBookingConfirmed(input: {
  attendeeName: string;
  title: string;
  whenLabel: string;
  platformLabel: string;
  meetUrl: string | null;
  totalFormatted: string;
  orderNumber: string;
  paymentId: string;
  manageUrl: string;
  /** "You can move it yourself until 24 hours before it starts." */
  rescheduleNote: string;
}): RenderedMail {
  const { attendeeName, title, whenLabel, platformLabel, meetUrl, totalFormatted, orderNumber, paymentId, manageUrl, rescheduleNote } = input;
  const linkLine = meetUrl
    ? `Join here: ${meetUrl}`
    : `We will email you the ${platformLabel} link before your call.`;

  const text = [
    `Hi ${attendeeName},`,
    ``,
    `Your one-to-one call is booked.`,
    ``,
    `  ${title}`,
    `  ${whenLabel}`,
    `  ${platformLabel}`,
    ``,
    linkLine,
    ``,
    `${rescheduleNote} See or move your booking: ${manageUrl}`,
    ``,
    `Amount paid: ${totalFormatted}`,
    `Order ID: ${orderNumber}`,
    `Payment ID: ${paymentId}`,
    ``,
    emailSignatureText(),
  ].join('\n');

  const html = layout(
    'Your call is booked',
    `
    <p style="${P}">Hi ${escapeHtml(attendeeName)},</p>
    ${callBox(title, [
      ['When', whenLabel],
      ['Where', platformLabel],
    ])}
    ${meetUrl ? button(meetUrl, 'Join the call') : `<p style="${P}">${escapeHtml(linkLine)}</p>`}
    <p style="${P}">${escapeHtml(rescheduleNote)}</p>
    ${button(manageUrl, 'See or move my booking')}
    <div style="margin:0 0 8px;">
      ${detailTable([
        ['Amount paid', totalFormatted],
        ['Order ID', orderNumber],
        ['Payment ID', paymentId],
      ])}
    </div>
    `,
  );

  return { subject: `JSMF - Your call is booked: ${whenLabel}`, text, html };
}

/** Sent when an admin adds or changes the joining link. */
export function mentorshipMeetLink(input: {
  attendeeName: string;
  title: string;
  whenLabel: string;
  platformLabel: string;
  meetUrl: string;
  manageUrl: string;
}): RenderedMail {
  const { attendeeName, title, whenLabel, platformLabel, meetUrl, manageUrl } = input;

  const text = [
    `Hi ${attendeeName},`,
    ``,
    `Here is the link for your one-to-one call.`,
    ``,
    `  ${title}`,
    `  ${whenLabel}`,
    ``,
    `Join here: ${meetUrl}`,
    ``,
    `Your booking: ${manageUrl}`,
    ``,
    emailSignatureText(),
  ].join('\n');

  const html = layout(
    `Your ${platformLabel} link`,
    `
    <p style="${P}">Hi ${escapeHtml(attendeeName)},</p>
    ${callBox(title, [
      ['When', whenLabel],
      ['Where', platformLabel],
    ])}
    ${button(meetUrl, 'Join the call')}
    ${linkFallback(meetUrl)}
    <p style="${MUTED}"><a href="${escapeHtml(manageUrl)}" style="color:#3f3f46;">See your booking</a></p>
    `,
  );

  return { subject: `JSMF - Link for your call: ${whenLabel}`, text, html };
}

/** Sent shortly before the call. Never sent without a joining link. */
export function mentorshipReminder(input: {
  attendeeName: string;
  title: string;
  whenLabel: string;
  platformLabel: string;
  meetUrl: string;
}): RenderedMail {
  const { attendeeName, title, whenLabel, platformLabel, meetUrl } = input;

  const text = [
    `Hi ${attendeeName},`,
    ``,
    `Your one-to-one call starts soon.`,
    ``,
    `  ${title}`,
    `  ${whenLabel}`,
    `  ${platformLabel}`,
    ``,
    `Join here: ${meetUrl}`,
    ``,
    emailSignatureText(),
  ].join('\n');

  const html = layout(
    'Your call starts soon',
    `
    <p style="${P}">Hi ${escapeHtml(attendeeName)},</p>
    ${callBox(title, [
      ['When', whenLabel],
      ['Where', platformLabel],
    ])}
    ${button(meetUrl, 'Join the call')}
    ${linkFallback(meetUrl)}
    `,
  );

  return { subject: `JSMF - Starting soon: your call at ${whenLabel}`, text, html };
}

/** Sent when the call moves — by the attendee themselves or by an admin. */
export function mentorshipRescheduled(input: {
  attendeeName: string;
  title: string;
  previousWhenLabel: string;
  whenLabel: string;
  platformLabel: string;
  meetUrl: string | null;
  manageUrl: string;
  /** True when an admin moved it, so the email says so rather than "you". */
  byAdmin: boolean;
}): RenderedMail {
  const { attendeeName, title, previousWhenLabel, whenLabel, platformLabel, meetUrl, manageUrl, byAdmin } = input;
  const lead = byAdmin ? 'Your one-to-one call has been moved to a new time.' : 'Your one-to-one call has been moved.';
  const linkLine = meetUrl ? `Join here: ${meetUrl}` : `We will email you the ${platformLabel} link before your call.`;

  const text = [
    `Hi ${attendeeName},`,
    ``,
    lead,
    ``,
    `  ${title}`,
    `  New time: ${whenLabel}`,
    `  Was: ${previousWhenLabel}`,
    ``,
    linkLine,
    ``,
    `Your booking: ${manageUrl}`,
    ``,
    emailSignatureText(),
  ].join('\n');

  const html = layout(
    'Your call has a new time',
    `
    <p style="${P}">Hi ${escapeHtml(attendeeName)},</p>
    <p style="${P}">${escapeHtml(lead)}</p>
    ${callBox(title, [
      ['New time', whenLabel],
      ['Was', previousWhenLabel],
      ['Where', platformLabel],
    ])}
    ${meetUrl ? button(meetUrl, 'Join the call') : `<p style="${P}">${escapeHtml(linkLine)}</p>`}
    <p style="${MUTED}"><a href="${escapeHtml(manageUrl)}" style="color:#3f3f46;">See your booking</a></p>
    `,
  );

  return { subject: `JSMF - Your call has moved to ${whenLabel}`, text, html };
}

/**
 * Sent when a payment arrives after the slot's hold lapsed and the time was
 * taken. The money is safe and someone will be in touch — the one thing this
 * email must not do is leave a paying customer wondering.
 */
export function mentorshipPaidUnscheduled(input: {
  attendeeName: string;
  title: string;
  whenLabel: string;
  totalFormatted: string;
  orderNumber: string;
  supportEmail: string;
}): RenderedMail {
  const { attendeeName, title, whenLabel, totalFormatted, orderNumber, supportEmail } = input;
  const body =
    `We received your payment of ${totalFormatted} for ${title} (order ${orderNumber}). ` +
    `The time you picked, ${whenLabel}, was booked by someone else just before your payment completed. ` +
    `We will contact you within a day to set a new time, or refund you in full if you prefer.`;

  const text = [
    `Hi ${attendeeName},`,
    ``,
    body,
    ``,
    `You can also write to us at ${supportEmail}.`,
    ``,
    emailSignatureText(),
  ].join('\n');

  const html = layout(
    'We will set a new time with you',
    `
    <p style="${P}">Hi ${escapeHtml(attendeeName)},</p>
    <p style="${P}">${escapeHtml(body)}</p>
    <p style="${MUTED}">You can also write to us at ${escapeHtml(supportEmail)}.</p>
    `,
  );

  return { subject: `JSMF - About your call booking (order ${orderNumber})`, text, html };
}

/** Sent when an admin cancels a call without the refund email covering it. */
export function mentorshipCancelled(input: {
  attendeeName: string;
  title: string;
  whenLabel: string;
  reason: string | null;
  supportEmail: string;
}): RenderedMail {
  const { attendeeName, title, whenLabel, reason, supportEmail } = input;

  const text = [
    `Hi ${attendeeName},`,
    ``,
    `Your one-to-one call on ${whenLabel} has been cancelled.`,
    ...(reason ? [``, reason] : []),
    ``,
    `Questions? Write to us at ${supportEmail}.`,
    ``,
    emailSignatureText(),
  ].join('\n');

  const html = layout(
    'Your call has been cancelled',
    `
    <p style="${P}">Hi ${escapeHtml(attendeeName)},</p>
    ${callBox(title, [['Was booked for', whenLabel]])}
    ${reason ? `<p style="${P}">${escapeHtmlMultiline(reason)}</p>` : ''}
    <p style="${MUTED}">Questions? Write to us at ${escapeHtml(supportEmail)}.</p>
    `,
  );

  return { subject: `JSMF - Your call on ${whenLabel} is cancelled`, text, html };
}

/** The internal alert: a call booked, moved, or needing a person. */
export function mentorshipAdminAlert(input: {
  kind: 'BOOKED' | 'RESCHEDULED' | 'NEEDS_ATTENTION';
  attendeeName: string;
  email: string | null;
  whatsappNumber: string | null;
  exam: string;
  notes: string | null;
  whenLabel: string;
  previousWhenLabel?: string;
  adminUrl: string;
}): RenderedMail {
  const { kind, attendeeName, email, whatsappNumber, exam, notes, whenLabel, previousWhenLabel, adminUrl } = input;
  const heading = {
    BOOKED: 'New one-to-one booking',
    RESCHEDULED: 'One-to-one call moved',
    NEEDS_ATTENTION: 'Paid call needs a new time',
  }[kind];

  const rows: Array<[string, string]> = [
    ['Who', attendeeName],
    ['Email', email ?? '-'],
    ['WhatsApp', whatsappNumber ? `+${whatsappNumber}` : '-'],
    ['Preparing for', exam],
    [kind === 'NEEDS_ATTENTION' ? 'Picked' : 'When', whenLabel],
    ...(previousWhenLabel ? ([['Was', previousWhenLabel]] as Array<[string, string]>) : []),
  ];

  const text = [
    heading,
    ``,
    ...rows.map(([label, value]) => `${label}: ${value}`),
    ...(notes ? [``, `They want to discuss:`, notes] : []),
    ``,
    adminUrl,
  ].join('\n');

  const html = layout(
    heading,
    `
    ${callBox(attendeeName, rows.slice(1))}
    ${notes ? `<p style="margin:0 0 8px;font-size:13px;color:#71717a;">They want to discuss:</p><p style="${P}">${escapeHtmlMultiline(notes)}</p>` : ''}
    ${button(adminUrl, 'Open in admin')}
    `,
  );

  return { subject: `JSMF admin - ${heading}: ${attendeeName}, ${whenLabel}`, text, html };
}
