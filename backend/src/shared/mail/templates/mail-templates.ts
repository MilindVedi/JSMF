/**
 * Email bodies as typed functions returning `{subject, text, html}`.
 *
 * Deliberately not a templating engine (Handlebars, MJML, React Email): those
 * earn their keep on marketing email with designers editing it. These are short
 * transactional messages, and a plain function gives compile-time checking of
 * the data each one needs — a missing field is a build error rather than an
 * empty gap in a delivered email.
 *
 * Every template returns a text part as well as HTML, because a text/plain
 * alternative is what makes mail readable in clients that block HTML and is a
 * well-known spam-scoring signal when missing.
 */

import { emailSignature, emailSignatureText } from './email-signature';

export interface RenderedMail {
  subject: string;
  text: string;
  html: string;
}

/**
 * Short info box appended to a session's emails when the admin has turned on
 * `show_not_spam_notice`. Styled as a soft tinted block rather than a warning
 * — the recipient already opened the email, so this is a nudge, not an alert.
 * Returned in two shapes so the plain-text and HTML paths stay symmetric.
 */
export const NOT_SPAM_NOTICE_TEXT =
  '📝 If this email landed in your Spam folder, please mark it as "Not spam" so you keep receiving future updates from JSMF.';

export function notSpamNoticeHtml(): string {
  return `
    <div style="margin:16px 0 0;padding:8px 12px;background:#f4f4f5;border-radius:6px;border:1px solid #e4e4e7;">
      <p style="margin:0;font-size:13px;line-height:1.5;color:#3f3f46;">📝 If this email landed in your <strong>Spam</strong> folder, please mark it as <strong>Not spam</strong> so you keep receiving future updates from JSMF.</p>
    </div>`;
}

/** Wraps body HTML in the minimal shell that mail clients render consistently. */
function layout(heading: string, bodyHtml: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f6f6f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#18181b;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
      <tr><td>
        <p style="margin:0 0 4px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#71717a;">JSMF</p>
        <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;">${heading}</h1>
        ${bodyHtml}
        <hr style="border:none;border-top:1px solid #e4e4e7;margin:28px 0 0;" />
        ${emailSignature()}
      </td></tr>
    </table>
  </body>
</html>`;
}

/**
 * Sent to someone an existing admin has invited to become an admin.
 *
 * The link goes to the invitee directly, which is the point: nothing has to be
 * relayed by hand over chat, and there is no public endpoint anyone can use to
 * trigger this. Whoever holds the link can claim admin, so it is single-use and
 * expires.
 */
export function adminInvitation(input: {
  inviteeName: string;
  invitedByName: string;
  link: string;
  expiresInHours: number;
}): RenderedMail {
  const { inviteeName, invitedByName, link, expiresInHours } = input;

  const text = [
    `${invitedByName} has invited you to administer JSMF.`,
    ``,
    `Accept the invitation and set up your account:`,
    `${link}`,
    ``,
    `This link expires in ${expiresInHours} hours and can be used once.`,
    ``,
    `An administrator can publish and withdraw content, see every customer's`,
    `orders, and issue refunds. If you were not expecting this invitation,`,
    `ignore this email and tell ${invitedByName}.`,
    ``,
    emailSignatureText(),
  ].join('\n');

  const html = layout(
    'You have been invited to administer JSMF',
    `
    <p style="margin:0 0 20px;font-size:15px;line-height:1.55;"><strong>${escapeHtml(invitedByName)}</strong> has invited you, ${escapeHtml(inviteeName)}, to administer JSMF.</p>
    <p style="margin:0 0 28px;text-align:center;">
      <a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 24px;background:#18181b;color:#ffffff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:500;">Accept invitation</a>
    </p>
    <p style="margin:0 0 20px;font-size:13px;line-height:1.55;color:#71717a;">This link expires in ${expiresInHours} hours and can be used once. If the button does not work, paste this into your browser:<br><span style="word-break:break-all;color:#3f3f46;">${escapeHtml(link)}</span></p>
    <p style="margin:0;font-size:13px;line-height:1.55;color:#71717a;">An administrator can publish and withdraw content, see every customer's orders, and issue refunds. If you were not expecting this invitation, ignore this email and tell ${escapeHtml(invitedByName)}.</p>
    `,
  );

  return { subject: `JSMF - ${invitedByName} invited you to become an administrator`, text, html };
}

/**
 * Sent after a payment clears — a confirmation, deliberately not an invoice.
 *
 * Two things it is careful about. It states where the resource actually lives
 * (the library, not this email), because the email is the one part of a
 * purchase that can fail: `sendBestEffort` means a buyer may never receive it,
 * and the entitlement is granted either way. Nothing here is the only copy of
 * anything.
 *
 * And it carries both identifiers. The order number is what a buyer can read
 * out in a support conversation; the payment id is what reconciles against the
 * provider's dashboard when the question is "did this actually go through".
 * Keeping both means a support request arrives with the evidence already in it.
 *
 * Not a GST invoice: `taxAmountMinor` is carried as zero today, and calling
 * this a receipt would make it a document with legal requirements it does not
 * meet. When tax becomes real, that is a separate document, not a bigger
 * version of this one.
 */
export function purchaseConfirmation(input: {
  buyerName: string;
  items: Array<{ title: string }>;
  totalFormatted: string;
  orderNumber: string;
  paymentId: string;
  libraryUrl: string;
}): RenderedMail {
  const { buyerName, items, totalFormatted, orderNumber, paymentId, libraryUrl } = input;

  const titles = items.map((item) => item.title);
  // "your resource" / "your resources" — the singular case is the overwhelming
  // majority and reads badly as "resource(s)".
  const noun = titles.length === 1 ? 'resource is' : 'resources are';

  const text = [
    `Hi ${buyerName},`,
    ``,
    `Your purchase was successful.`,
    ``,
    ...titles.map((title) => `  ${title}`),
    ``,
    `Amount paid: ${totalFormatted}`,
    `Order ID: ${orderNumber}`,
    `Payment ID: ${paymentId}`,
    ``,
    `Your ${noun} now available in your JSMF account.`,
    `${libraryUrl}`,
    ``,
    `You can access ${titles.length === 1 ? 'it' : 'them'} anytime from your JSMF account.`,
    ``,
    emailSignatureText(),
  ].join('\n');

  const itemsHtml = titles
    .map(
      (title) =>
        `<p style="margin:0 0 6px;font-size:15px;line-height:1.55;font-weight:600;">${escapeHtml(title)}</p>`,
    )
    .join('');

  const detailRow = (label: string, value: string): string =>
    `<tr>
      <td style="padding:4px 0;font-size:13px;color:#71717a;">${escapeHtml(label)}</td>
      <td style="padding:4px 0;font-size:13px;color:#3f3f46;text-align:right;">${escapeHtml(value)}</td>
    </tr>`;

  const html = layout(
    'Your purchase is confirmed',
    `
    <p style="margin:0 0 20px;font-size:15px;line-height:1.55;">Hi ${escapeHtml(buyerName)},</p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.55;">Your purchase was successful.</p>
    <div style="margin:0 0 20px;padding:16px;background:#fafafa;border-radius:8px;">
      ${itemsHtml}
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin-top:12px;">
        ${detailRow('Amount paid', totalFormatted)}
        ${detailRow('Order ID', orderNumber)}
        ${detailRow('Payment ID', paymentId)}
      </table>
    </div>
    <p style="margin:0 0 28px;text-align:center;">
      <a href="${escapeHtml(libraryUrl)}" style="display:inline-block;padding:12px 24px;background:#18181b;color:#ffffff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:500;">Open my library</a>
    </p>
    <p style="margin:0 0 20px;font-size:13px;line-height:1.55;color:#71717a;">Your ${noun} now available in your JSMF account. You can access ${titles.length === 1 ? 'it' : 'them'} anytime from your account — you do not need this email.</p>
    <p style="margin:0;font-size:13px;line-height:1.55;color:#71717a;">JSMF<br>Medically led by Dr. Angad Rai</p>
    `,
  );

  return { subject: 'JSMF - Your purchase is confirmed', text, html };
}

/**
 * Sent after a full refund has been processed — the counterpart to
 * `purchaseConfirmation`, and sent on the same best-effort terms.
 *
 * Says the two things a refunded buyer actually wants to know and would
 * otherwise write in to ask: when the money lands, and that it lands back where
 * it came from. Banks commonly take several working days to post a reversal, so
 * a buyer who checks the next morning and sees nothing concludes the refund
 * failed; naming the window up front is what stops that support ticket.
 *
 * It also states plainly that the material is no longer in their library.
 * Access is revoked in the same transaction as the refund, so staying quiet
 * about it would leave the buyer to discover it on their own and read it as a
 * fault rather than the other half of getting their money back.
 *
 * Only ever sent for refunds that return the full captured amount. A partial
 * refund leaves access in place, which this wording would contradict.
 */
export function refundConfirmation(input: {
  buyerName: string;
  items: Array<{ title: string }>;
  refundedFormatted: string;
  orderNumber: string;
  refundId: string;
  /** Whether the money went back over a real-time rail rather than the slow one. */
  instant?: boolean;
}): RenderedMail {
  const { buyerName, items, refundedFormatted, orderNumber, refundId, instant = false } = input;

  const titles = items.map((item) => item.title);
  const noun = titles.length === 1 ? 'resource is' : 'resources are';

  // The timing is the whole reason this email exists, so it states what
  // actually happened rather than a worst case. Promising days for a refund
  // that already landed reads as a mistake; promising minutes for one that
  // takes a week produces the support ticket this is meant to prevent.
  const timingText = instant
    ? 'The amount has been sent back to the method you paid with and should reach you within a few minutes.'
    : 'The amount goes back to the method you paid with. Banks usually take 5-7 working days to show it on your statement.';

  const timingHtml = instant
    ? 'The amount has been sent back to the method you paid with and should reach you <strong>within a few minutes</strong>.'
    : 'The amount goes back to the method you paid with. Banks usually take <strong>5-7 working days</strong> to show it on your statement.';

  const text = [
    `Hi ${buyerName},`,
    ``,
    `Your refund has been processed.`,
    ``,
    ...titles.map((title) => `  ${title}`),
    ``,
    `Amount refunded: ${refundedFormatted}`,
    `Order ID: ${orderNumber}`,
    `Refund ID: ${refundId}`,
    ``,
    timingText,
    ``,
    `The ${noun} no longer available in your JSMF account.`,
    ``,
    `If anything about this looks wrong, reply to this email with your Order ID`,
    `and we will look into it.`,
    ``,
    emailSignatureText(),
  ].join('\n');

  const itemsHtml = titles
    .map(
      (title) =>
        `<p style="margin:0 0 6px;font-size:15px;line-height:1.55;font-weight:600;">${escapeHtml(title)}</p>`,
    )
    .join('');

  const detailRow = (label: string, value: string): string =>
    `<tr>
      <td style="padding:4px 0;font-size:13px;color:#71717a;">${escapeHtml(label)}</td>
      <td style="padding:4px 0;font-size:13px;color:#3f3f46;text-align:right;">${escapeHtml(value)}</td>
    </tr>`;

  const html = layout(
    'Your refund has been processed',
    `
    <p style="margin:0 0 20px;font-size:15px;line-height:1.55;">Hi ${escapeHtml(buyerName)},</p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.55;">Your refund has been processed.</p>
    <div style="margin:0 0 20px;padding:16px;background:#fafafa;border-radius:8px;">
      ${itemsHtml}
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin-top:12px;">
        ${detailRow('Amount refunded', refundedFormatted)}
        ${detailRow('Order ID', orderNumber)}
        ${detailRow('Refund ID', refundId)}
      </table>
    </div>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.55;">${timingHtml}</p>
    <p style="margin:0 0 20px;font-size:13px;line-height:1.55;color:#71717a;">The ${noun} no longer available in your JSMF account.</p>
    <p style="margin:0;font-size:13px;line-height:1.55;color:#71717a;">If anything about this looks wrong, reply to this email with your Order ID and we will look into it.</p>
    `,
  );

  return { subject: `JSMF - Your refund for ${orderNumber} has been processed`, text, html };
}

/** The code itself, rendered so it can be read off a phone and retyped. */
function codeBlock(code: string): string {
  return `<p style="margin:0 0 24px;padding:16px;background:#fafafa;border-radius:12px;text-align:center;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:30px;font-weight:700;letter-spacing:.32em;text-indent:.32em;color:#18181b;">${escapeHtml(code)}</p>`;
}

/**
 * The code that proves a new buyer owns the address they signed up with.
 *
 * No link, only a code. A link would have to carry a token in a URL, which
 * leaks through browser history, referrer headers and any chat app it is
 * pasted into — and the whole point here is that possession of the *inbox* is
 * what is being proven. Six digits retyped from the message proves exactly
 * that and nothing travels anywhere it should not.
 *
 * The account does not exist yet when this is sent, which is deliberate: an
 * address that never verifies leaves nothing behind to clean up.
 */
export function signupVerificationCode(input: {
  name: string | null;
  code: string;
  expiresInMinutes: number;
}): RenderedMail {
  const { name, code, expiresInMinutes } = input;
  const greeting = name ? `Hi ${name},` : 'Hi,';

  const text = [
    greeting,
    ``,
    `Your JSMF verification code is:`,
    ``,
    `  ${code}`,
    ``,
    `Enter it on the signup page to finish creating your account.`,
    `The code expires in ${expiresInMinutes} minutes and can be used once.`,
    ``,
    `If you did not try to create a JSMF account, you can ignore this email —`,
    `nothing has been created and no account exists at this address.`,
    ``,
    emailSignatureText(),
  ].join('\n');

  const html = layout(
    'Confirm your email address',
    `
    <p style="margin:0 0 20px;font-size:15px;line-height:1.55;">${escapeHtml(greeting)}</p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.55;">Enter this code on the signup page to finish creating your account.</p>
    ${codeBlock(code)}
    <p style="margin:0 0 20px;font-size:13px;line-height:1.55;color:#71717a;">The code expires in ${expiresInMinutes} minutes and can be used once.</p>
    <p style="margin:0;font-size:13px;line-height:1.55;color:#71717a;">If you did not try to create a JSMF account, you can ignore this email — nothing has been created, and no account exists at this address.</p>
    `,
  );

  return { subject: `JSMF - ${code} is your verification code`, text, html };
}

/**
 * The code that lets someone set a new password.
 *
 * Says plainly that nothing has changed yet, because the alarming case is
 * receiving this without having asked: the reassurance that the password is
 * still the old one is the part that stops a recipient panicking, and the
 * instruction to ignore it is genuinely sufficient — an unused code expires on
 * its own.
 */
export function passwordResetCode(input: {
  code: string;
  expiresInMinutes: number;
}): RenderedMail {
  const { code, expiresInMinutes } = input;

  const text = [
    `Someone asked to reset the password for this JSMF account.`,
    ``,
    `Your reset code is:`,
    ``,
    `  ${code}`,
    ``,
    `Enter it on the password reset page to choose a new password.`,
    `The code expires in ${expiresInMinutes} minutes and can be used once.`,
    ``,
    `If this was not you, ignore this email. Your password has not been changed`,
    `and nothing happens until the code above is used.`,
    ``,
    emailSignatureText(),
  ].join('\n');

  const html = layout(
    'Reset your password',
    `
    <p style="margin:0 0 20px;font-size:15px;line-height:1.55;">Someone asked to reset the password for this JSMF account. Enter this code to choose a new one.</p>
    ${codeBlock(code)}
    <p style="margin:0 0 20px;font-size:13px;line-height:1.55;color:#71717a;">The code expires in ${expiresInMinutes} minutes and can be used once.</p>
    <p style="margin:0;font-size:13px;line-height:1.55;color:#71717a;">If this was not you, ignore this email. <strong>Your password has not been changed</strong>, and nothing happens until the code above is used.</p>
    `,
  );

  return { subject: `JSMF - ${code} is your password reset code`, text, html };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Like `escapeHtml`, but preserves line breaks the admin typed into a
 * textarea — HTML collapses `\n` to whitespace otherwise, and the message a
 * person entered as two paragraphs would arrive as one run-on sentence.
 */
function escapeHtmlMultiline(value: string): string {
  return escapeHtml(value).replace(/\r?\n/g, '<br>');
}

function button(href: string, label: string): string {
  return `<p style="margin:0 0 24px;text-align:center;">
      <a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 24px;background:#18181b;color:#ffffff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:500;">${escapeHtml(label)}</a>
    </p>`;
}

function detailTable(rows: Array<[string, string]>): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
      ${rows
        .map(
          ([label, value]) => `<tr>
        <td style="padding:4px 0;font-size:13px;color:#71717a;vertical-align:top;">${escapeHtml(label)}</td>
        <td style="padding:4px 0;font-size:13px;color:#3f3f46;text-align:right;">${escapeHtml(value)}</td>
      </tr>`,
        )
        .join('')}
    </table>`;
}

/**
 * Sent once when a live-session payment clears. It is the buyer's only
 * confirmation — the generic purchase receipt is skipped for sessions — so it
 * carries the receipt facts (amount, order and payment ids) as well as when
 * and where.
 *
 * The joining link is included when it already exists. Often it does not yet:
 * sessions are announced before the meeting is created, and the reminder
 * before the start is what reliably carries it.
 */
export function liveSessionConfirmation(input: {
  attendeeName: string;
  sessionTitle: string;
  /** One line per day, in order. */
  whenLines: string[];
  platformLabel: string;
  joinUrl: string | null;
  totalFormatted: string;
  orderNumber: string;
  paymentId: string;
  /** Titles of the PDFs included with the session, now in the buyer's library. */
  includedTitles: string[];
  libraryUrl: string;
  /**
   * Admin-written subject for this session. `{title}` is substituted with
   * `sessionTitle`. Null keeps the default below.
   */
  subjectOverride?: string | null;
  /**
   * What to say instead of "We will email you the joining link before the
   * session starts" while `joinUrl` is empty — the default sentence is wrong
   * for a session whose dates are not announced yet. Null keeps the default.
   */
  pendingJoinLinkText?: string | null;
  /** Append the "mark as Not spam" info box. See NOT_SPAM_NOTICE_TEXT. */
  showNotSpamNotice?: boolean;
}): RenderedMail {
  const {
    attendeeName,
    sessionTitle,
    whenLines,
    platformLabel,
    joinUrl,
    totalFormatted,
    orderNumber,
    paymentId,
    includedTitles,
    libraryUrl,
    subjectOverride,
    pendingJoinLinkText,
    showNotSpamNotice,
  } = input;

  const pendingLine = pendingJoinLinkText?.trim()
    ? pendingJoinLinkText.trim()
    : 'We will email you the joining link before the session starts.';

  const linkLine = joinUrl ? `Join here: ${joinUrl}` : pendingLine;

  const included = includedTitles.length
    ? [``, `Included with your seat, now in your JSMF library:`, ...includedTitles.map((t) => `  ${t}`), libraryUrl]
    : [];

  const text = [
    `Hi ${attendeeName},`,
    ``,
    `Your seat is confirmed${whenLines.length > 1 ? ` for all ${whenLines.length} days` : ''}.`,
    ``,
    `  ${sessionTitle}`,
    ...whenLines.map((line) => `  ${line}`),
    `  ${platformLabel}`,
    ``,
    linkLine,
    ...included,
    ``,
    `Amount paid: ${totalFormatted}`,
    `Order ID: ${orderNumber}`,
    `Payment ID: ${paymentId}`,
    ``,
    ...(showNotSpamNotice ? [NOT_SPAM_NOTICE_TEXT, ``] : []),
    emailSignatureText(),
  ].join('\n');

  const html = layout(
    'Your seat is confirmed',
    `
    <p style="margin:0 0 20px;font-size:15px;line-height:1.55;">Hi ${escapeHtml(attendeeName)},</p>
    <div style="margin:0 0 20px;padding:16px;background:#fafafa;border-radius:8px;">
      <p style="margin:0 0 10px;font-size:15px;line-height:1.45;font-weight:600;">${escapeHtml(sessionTitle)}</p>
      ${detailTable([
        ...whenLines.map((line, index): [string, string] => [index === 0 ? 'When' : '', line]),
        ['Where', platformLabel],
      ])}
    </div>
    ${
      joinUrl
        ? button(joinUrl, 'Join the session')
        : `<p style="margin:0 0 20px;font-size:15px;line-height:1.55;">${escapeHtmlMultiline(pendingLine)}</p>`
    }
    ${
      includedTitles.length
        ? `<p style="margin:0 0 8px;font-size:15px;line-height:1.55;">Included with your seat, and already in your JSMF library:</p>
    ${includedTitles.map((t) => `<p style="margin:0 0 6px;font-size:15px;font-weight:600;">${escapeHtml(t)}</p>`).join('')}
    <p style="margin:12px 0 24px;"><a href="${escapeHtml(libraryUrl)}" style="color:#18181b;font-size:14px;">Open my library</a></p>`
        : ''
    }
    <div style="margin:0 0 8px;">
      ${detailTable([
        ['Amount paid', totalFormatted],
        ['Order ID', orderNumber],
        ['Payment ID', paymentId],
      ])}
    </div>
    ${showNotSpamNotice ? notSpamNoticeHtml() : ''}
    `,
  );

  const subject = subjectOverride?.trim()
    ? subjectOverride.trim().replaceAll('{title}', sessionTitle)
    : `JSMF - Your seat is confirmed: ${sessionTitle}`;

  return { subject, text, html };
}

/**
 * Sent when a session's included material reaches its buyers after the event
 * rather than at payment — the ordinary case when the PDF is still being
 * written while seats are already selling.
 *
 * Deliberately says nothing about the wait. The recipient has no idea the
 * material was ever meant to arrive sooner, and explaining a delay they did
 * not notice invents a problem; what they need is that it is here and where to
 * find it.
 */
export function liveSessionBundleReady(input: {
  attendeeName: string;
  sessionTitle: string;
  includedTitles: string[];
  libraryUrl: string;
  showNotSpamNotice?: boolean;
}): RenderedMail {
  const { attendeeName, sessionTitle, includedTitles, libraryUrl, showNotSpamNotice } = input;

  const text = [
    `Hi ${attendeeName},`,
    ``,
    `The material included with your seat for ${sessionTitle} is now in your`,
    `JSMF library:`,
    ``,
    ...includedTitles.map((title) => `  ${title}`),
    ``,
    `${libraryUrl}`,
    ``,
    ...(showNotSpamNotice ? [NOT_SPAM_NOTICE_TEXT, ``] : []),
    emailSignatureText(),
  ].join('\n');

  const html = layout(
    'Your material is ready',
    `
    <p style="margin:0 0 20px;font-size:15px;line-height:1.55;">Hi ${escapeHtml(attendeeName)},</p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.55;">The material included with your seat for <strong>${escapeHtml(sessionTitle)}</strong> is now in your JSMF library.</p>
    <div style="margin:0 0 24px;padding:16px;background:#fafafa;border-radius:8px;">
      ${includedTitles
        .map(
          (title) =>
            `<p style="margin:0 0 6px;font-size:15px;line-height:1.45;font-weight:600;">${escapeHtml(title)}</p>`,
        )
        .join('')}
    </div>
    ${button(libraryUrl, 'Open my library')}
    <p style="margin:0;font-size:13px;line-height:1.55;color:#71717a;">You can open it any time from your JSMF account — you do not need this email.</p>
    ${showNotSpamNotice ? notSpamNoticeHtml() : ''}
    `,
  );

  return { subject: `JSMF - Your ${sessionTitle} material is ready`, text, html };
}

/**
 * Sent shortly before each day of a session starts, to everyone holding a
 * seat. A multi-day session sends one per day, marked "Day 2 of 3".
 */
export function liveSessionReminder(input: {
  attendeeName: string;
  sessionTitle: string;
  /** The day this reminder is for. */
  whenLabel: string;
  /** "Day 2 of 3", or null for a one-day session. */
  dayMarker: string | null;
  platformLabel: string;
  joinUrl: string;
  showNotSpamNotice?: boolean;
}): RenderedMail {
  const { attendeeName, sessionTitle, whenLabel, dayMarker, platformLabel, joinUrl, showNotSpamNotice } = input;
  const heading = dayMarker ? `${sessionTitle} (${dayMarker})` : sessionTitle;

  const text = [
    `Hi ${attendeeName},`,
    ``,
    `${heading} starts soon.`,
    ``,
    `  ${whenLabel}`,
    `  ${platformLabel}`,
    ``,
    `Join here: ${joinUrl}`,
    ``,
    ...(showNotSpamNotice ? [NOT_SPAM_NOTICE_TEXT, ``] : []),
    emailSignatureText(),
  ].join('\n');

  const html = layout(
    'Your session starts soon',
    `
    <p style="margin:0 0 20px;font-size:15px;line-height:1.55;">Hi ${escapeHtml(attendeeName)},</p>
    <div style="margin:0 0 20px;padding:16px;background:#fafafa;border-radius:8px;">
      <p style="margin:0 0 10px;font-size:15px;line-height:1.45;font-weight:600;">${escapeHtml(heading)}</p>
      ${detailTable([
        ['When', whenLabel],
        ['Where', platformLabel],
      ])}
    </div>
    ${button(joinUrl, 'Join the session')}
    <p style="margin:0;font-size:13px;line-height:1.55;color:#71717a;">If the button does not work, paste this into your browser:<br><span style="word-break:break-all;color:#3f3f46;">${escapeHtml(joinUrl)}</span></p>
    ${showNotSpamNotice ? notSpamNoticeHtml() : ''}
    `,
  );

  return { subject: `JSMF - Starting soon: ${heading}`, text, html };
}

/**
 * Sent when an admin announces dates for a session that was sold as "date to
 * be announced". Deliberately phrased as a confirmation of dates, not as a
 * correction of something missing — the buyer simply learns the schedule now.
 */
export function liveSessionDatesAnnounced(input: {
  attendeeName: string;
  sessionTitle: string;
  /** One line per day, in order (from sessionWhenLines). */
  whenLines: string[];
  platformLabel: string;
  joinUrl: string | null;
  showNotSpamNotice?: boolean;
}): RenderedMail {
  const { attendeeName, sessionTitle, whenLines, platformLabel, joinUrl, showNotSpamNotice } = input;

  const linkLine = joinUrl
    ? `Join here: ${joinUrl}`
    : `We will email you the joining link before the session starts.`;

  const text = [
    `Hi ${attendeeName},`,
    ``,
    `The date${whenLines.length > 1 ? 's' : ''} for ${sessionTitle} ${whenLines.length > 1 ? 'are' : 'is'} confirmed.`,
    ``,
    `  ${sessionTitle}`,
    ...whenLines.map((line) => `  ${line}`),
    `  ${platformLabel}`,
    ``,
    linkLine,
    ``,
    ...(showNotSpamNotice ? [NOT_SPAM_NOTICE_TEXT, ``] : []),
    emailSignatureText(),
  ].join('\n');

  const html = layout(
    'Dates confirmed',
    `
    <p style="margin:0 0 20px;font-size:15px;line-height:1.55;">Hi ${escapeHtml(attendeeName)},</p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.55;">The date${whenLines.length > 1 ? 's' : ''} for your session ${whenLines.length > 1 ? 'are' : 'is'} confirmed:</p>
    <div style="margin:0 0 20px;padding:16px;background:#fafafa;border-radius:8px;">
      <p style="margin:0 0 10px;font-size:15px;line-height:1.45;font-weight:600;">${escapeHtml(sessionTitle)}</p>
      ${detailTable([
        ...whenLines.map((line, index): [string, string] => [index === 0 ? 'When' : '', line]),
        ['Where', platformLabel],
      ])}
    </div>
    ${
      joinUrl
        ? button(joinUrl, 'Join the session')
        : `<p style="margin:0 0 20px;font-size:15px;line-height:1.55;">We will email you the joining link before the session starts.</p>`
    }
    ${showNotSpamNotice ? notSpamNoticeHtml() : ''}
    `,
  );

  return { subject: `JSMF - Dates confirmed: ${sessionTitle}`, text, html };
}
