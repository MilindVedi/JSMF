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

export interface RenderedMail {
  subject: string;
  text: string;
  html: string;
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

  return { subject: `${invitedByName} invited you to administer JSMF`, text, html };
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
    `—`,
    `JSMF`,
    `by Dr. Angad Rai`,
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

  return { subject: 'Your JSMF purchase is confirmed', text, html };
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
    `—`,
    `JSMF`,
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

  return { subject: `${code} is your JSMF verification code`, text, html };
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
    `—`,
    `JSMF`,
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

  return { subject: `${code} is your JSMF password reset code`, text, html };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
