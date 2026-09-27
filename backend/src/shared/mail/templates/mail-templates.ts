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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
