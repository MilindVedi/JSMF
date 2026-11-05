/**
 * Removes what must never be stored in a log from free text the server did
 * not write itself — an error message or stack trace sent by a browser or a
 * phone. Text from a client can contain anything the page had in hand: a URL
 * with a reset code in it, a token caught in an exception message, the email
 * or phone number someone typed.
 *
 * Patterns, not a parser, so the rule is "when in doubt, cut": a stack trace
 * with a few characters too many replaced is still useful, a leaked credential
 * is not. Stack frames survive intact — file paths keep their line and column,
 * and only a query string after them is dropped.
 *
 * The same rules run in the apps before anything is sent (see
 * packages/core/src/observability/error-report.ts). This copy is the one that
 * counts: a client can be modified, the server cannot.
 */

const RULES: ReadonlyArray<readonly [RegExp, string]> = [
  // Control characters (newline and tab are kept for stack traces): a stored
  // escape sequence must not repaint a terminal that later prints the log.
  [/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, ''],
  // A URL's query string and fragment — where reset codes, OAuth codes and
  // signed-download signatures live — for absolute URLs, then site paths.
  // `:` stops the match so the `:line:col` after a script URL in a stack
  // frame is kept. (No lookbehind, here or below: the client copy of these
  // rules must parse on every browser, and the two copies stay identical.)
  [/(\b[a-z][a-z0-9+.-]*:\/\/[^\s?#"'`()<>]+)[?#][^\s"'`()<>:]*/gi, '$1'],
  [/(^|[\s("'`])(\/[^\s?#"'`()<>]*)[?#][^\s"'`()<>:]*/g, '$1$2'],
  // JSON Web Tokens (the access token is one).
  [/\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]*/g, '[jwt]'],
  // Authorization header values.
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, '$1 [redacted]'],
  // key=value / "key": "value" where the key names a secret. These match
  // inside longer names too (refreshToken, x-api-key, clientSecret) …
  [
    /([\w-]*(?:password|passwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|session[_-]?id|signature|credential)s?)(["']?\s*[:=]\s*["']?)[^\s"'&,;)}\]]+/gi,
    '$1$2[redacted]',
  ],
  // … these only as whole words, so `statusCode=500` survives.
  [/\b(otp|code|pass|pin|auth|authorization|cookie|sig)(["']?\s*[:=]\s*["']?)[^\s"'&,;)}\]]+/gi, '$1$2[redacted]'],
  [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email]'],
  // Card-like digit runs, then Indian mobile numbers.
  [/(^|[^\d:])(?:\d[ -]?){12,18}\d(?![\d:])/g, '$1[number]'],
  [/(^|[^\d:+])(?:\+?91[ -]?)?[6-9]\d{4}[ -]?\d{5}(?![\d:])/g, '$1[phone]'],
  // Long hex strings: API keys, hashes of secrets, raw ids of signed objects.
  [/\b[a-f0-9]{32,}\b/gi, '[hex]'],
];

export function redactSecrets(text: string): string {
  let out = text;
  for (const [pattern, replacement] of RULES) out = out.replace(pattern, replacement);
  return out;
}
