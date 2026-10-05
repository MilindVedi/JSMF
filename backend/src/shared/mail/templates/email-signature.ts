/**
 * Brand signature block appended to every transactional email.
 *
 * Separated from the template body so the signature can be updated in one
 * place without touching any individual template, and so it can be turned off
 * (or swapped for a seasonal variant) by changing a single import.
 *
 * Every image is an absolute URL to either the public GCS bucket (the logo)
 * or a stable CDN (social icons). Email clients strip `<link>` and `<style>`
 * tags, so all styling is inline — the same constraint the rest of the email
 * templates observe.
 *
 * The social-icon URLs come from Flaticon's CDN; if they ever go stale,
 * upload replacements to the `brand/` prefix in `jsmf-public-509708` and
 * point the `src` attributes there instead.
 */

const LOGO_URL =
  'https://storage.googleapis.com/jsmf-public-509708/brand/jab-studies-full-logo.png';

const SOCIALS = [
  {
    href: 'https://www.instagram.com/angadrai009/',
    icon: 'https://cdn-icons-png.flaticon.com/32/174/174855.png',
    alt: 'Instagram',
  },
  {
    href: 'https://www.youtube.com/@Jabstudiesmetfun',
    icon: 'https://cdn-icons-png.flaticon.com/32/1384/1384060.png',
    alt: 'YouTube',
  },
  {
    href: 'https://t.me/JABSTUDIESMETFUN',
    icon: 'https://cdn-icons-png.flaticon.com/32/2111/2111646.png',
    alt: 'Telegram',
  },
] as const;

const CONTACT = {
  email: 'support@jsmf.me',
  website: 'jsmf.me',
  websiteUrl: 'https://jsmf.me',
  emailIcon: 'https://cdn-icons-png.flaticon.com/24/646/646094.png',
  webIcon: 'https://cdn-icons-png.flaticon.com/24/1006/1006771.png',
} as const;

/** Returns the HTML signature block. Pure function, no side-effects. */
export function emailSignature(): string {
  const socialIconsHtml = SOCIALS.map(
    (s) =>
      `<td style="padding-right:10px;">` +
      `<a href="${s.href}" target="_blank" style="text-decoration:none;">` +
      `<img src="${s.icon}" alt="${s.alt}" width="28" height="28" style="display:block;border:0;" />` +
      `</a></td>`,
  ).join('');

  return `
    <table cellpadding="0" cellspacing="0" border="0" role="presentation"
           style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin-top:24px;">
      <tr>
        <td style="vertical-align:top;padding-right:20px;width:160px;">
          <img src="${LOGO_URL}" alt="JSMF" width="150"
               style="border-radius:10px;display:block;" />
          <table cellpadding="0" cellspacing="0" border="0" role="presentation"
                 style="margin-top:12px;">
            <tr>${socialIconsHtml}</tr>
          </table>
        </td>
        <td style="vertical-align:top;padding-top:8px;">
          <span style="font-size:28px;font-weight:bold;color:#2b2b2b;">JSMF</span><br />
          <span style="font-size:16px;color:#555;">by Dr. Angad Rai</span><br />
          <hr style="border:none;border-top:2px solid #ddd;margin:10px 0;" />
          <table cellpadding="0" cellspacing="0" border="0" role="presentation">
            <tr>
              <td style="padding:4px 10px 4px 0;vertical-align:middle;">
                <img src="${CONTACT.emailIcon}" alt="Email" width="22" height="22"
                     style="display:block;border:0;" />
              </td>
              <td style="vertical-align:middle;padding-bottom:2px;">
                <a href="mailto:${CONTACT.email}"
                   style="color:#2b2b2b;text-decoration:none;font-size:15px;">${CONTACT.email}</a>
              </td>
            </tr>
            <tr><td style="height:8px;" colspan="2"></td></tr>
            <tr>
              <td style="padding:4px 10px 4px 0;vertical-align:middle;">
                <img src="${CONTACT.webIcon}" alt="Web" width="22" height="22"
                     style="display:block;border:0;" />
              </td>
              <td style="vertical-align:middle;padding-bottom:2px;">
                <a href="${CONTACT.websiteUrl}"
                   style="color:#2b2b2b;text-decoration:none;font-size:15px;">${CONTACT.website}</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
}

/** Plain-text equivalent for the text/plain part of every email. */
export function emailSignatureText(): string {
  return [
    '—',
    'JSMF',
    'by Dr. Angad Rai',
    '',
    `Email: ${CONTACT.email}`,
    `Web:   ${CONTACT.websiteUrl}`,
    '',
    `Instagram: ${SOCIALS[0].href}`,
    `YouTube:   ${SOCIALS[1].href}`,
    `Telegram:  ${SOCIALS[2].href}`,
  ].join('\n');
}
