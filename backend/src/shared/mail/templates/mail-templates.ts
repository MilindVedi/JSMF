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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
