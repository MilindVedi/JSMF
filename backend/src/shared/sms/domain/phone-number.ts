/**
 * Turning what a person typed into the one format everything else uses.
 *
 * This exists as its own module, with its own tests, because a phone number is
 * about to become a *unique key* on an account — and a value that can be
 * written two ways is not a key. `+91 98765 43210`, `098765 43210` and
 * `9876543210` are one person; if any two of them reach the database unchanged,
 * that person gets two accounts and the second one cannot be merged into the
 * first without a human deciding who owns which purchases.
 *
 * So normalisation happens once, at the edge, and the canonical form is the
 * only thing that travels inward. The same function is used when storing a
 * number and when sending to it, which is what guarantees the two agree.
 */

/** E.164 allows at most 15 digits including the country code. */
const E164_MAX_DIGITS = 15;
/** Below this, it is not a mobile number in any country — it is a typo. */
const E164_MIN_DIGITS = 8;
/**
 * The shortest national mobile number worth treating as complete. Used only to
 * decide whether a leading country code is really a country code; India's are
 * ten digits, and no market we would enter uses fewer than this.
 */
const NATIONAL_MIN_DIGITS = 9;

export class InvalidPhoneNumberError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPhoneNumberError';
  }
}

export interface NormalisePhoneOptions {
  /**
   * Assumed when the input carries no country code of its own — `'91'` for
   * India. Configured rather than constant (`SMS_DEFAULT_COUNTRY_CODE`) so the
   * first market outside India is a variable rather than an edit here.
   */
  defaultCountryCode: string;
}

/**
 * E.164 digits with no `+` — `919876543210` — or throws.
 *
 * No `+` because that is what both MSG91 and the database column want, and
 * carrying a sigil that every consumer strips is just an extra way for two
 * values to differ. The `+` is added back for display, where it belongs.
 */
export function normalisePhoneNumber(
  input: string,
  options: NormalisePhoneOptions,
): string {
  const raw = input.trim();

  // Spaces, dashes and brackets are how humans read numbers aloud; none of
  // them carry meaning. A leading `+` does carry meaning, so it is noted
  // before being stripped.
  const hadPlus = raw.startsWith('+') || raw.startsWith('00');
  const digits = raw.replace(/\D/g, '');

  if (!digits) {
    throw new InvalidPhoneNumberError('Enter a mobile number');
  }

  const country = options.defaultCountryCode.replace(/\D/g, '');
  const national = deriveNational(digits, country, hadPlus);
  const e164 = `${country}${national}`;

  if (national.length < E164_MIN_DIGITS - country.length || e164.length > E164_MAX_DIGITS) {
    throw new InvalidPhoneNumberError('That does not look like a valid mobile number');
  }

  // India-specific, and deliberately the only country rule in here. Indian
  // mobile numbers are exactly ten digits starting 6–9; landlines and the
  // various short codes do not, and a code sent to one of those is silently
  // lost rather than rejected. Being strict here converts an invisible failure
  // into an error the person can fix while they are still looking at the form.
  if (country === '91' && !/^[6-9]\d{9}$/.test(national)) {
    throw new InvalidPhoneNumberError('Enter a 10-digit Indian mobile number');
  }

  return e164;
}

/** `+91 98765 43210` — for showing a number back to the person it belongs to. */
export function formatPhoneNumber(e164: string): string {
  return `+${e164}`;
}

/**
 * `+91 ***** 43210` — for anywhere a number is shown to someone who has not
 * yet proved it is theirs.
 *
 * Password reset over SMS has the same problem the email flow has: the screen
 * confirming "we sent a code to…" is visible to whoever asked, who may not be
 * the account holder. Showing the last four digits is enough for the real owner
 * to recognise their own number and not enough for anyone else to learn it.
 */
export function maskPhoneNumber(e164: string): string {
  if (e164.length <= 4) return '*'.repeat(e164.length);
  return `+${'*'.repeat(e164.length - 4)}${e164.slice(-4)}`;
}

/**
 * Strips whichever way the country code was expressed, leaving the national
 * number.
 *
 * The awkward case is a bare `919876543210` with no `+`. It is treated as
 * already carrying the country code, because in India a national number is ten
 * digits and twelve digits beginning `91` is unambiguous. Where that heuristic
 * would be ambiguous the explicit `+` settles it, which is why `hadPlus` is
 * tracked at all.
 */
function deriveNational(digits: string, country: string, hadPlus: boolean): string {
  // `00` is the international prefix in much of the world; `+` is the same
  // thing written differently.
  let rest = digits.startsWith('00') ? digits.slice(2) : digits;

  if (rest.startsWith(country)) {
    const withoutCountry = rest.slice(country.length);
    // Only treat a leading `91` as the country code when what remains is still
    // a whole national number. This is what keeps `9186543210` — a real Indian
    // mobile that happens to begin with the country code — from being read as
    // `+91 86543210` and rejected as too short. An explicit `+` settles it
    // either way, which is why `hadPlus` is tracked at all.
    if (hadPlus || withoutCountry.length >= NATIONAL_MIN_DIGITS) {
      rest = withoutCountry;
    }
  }

  // A domestic trunk prefix — `0` before the number, as Indian numbers are
  // often written. Meaningless once a country code is present.
  return rest.replace(/^0+/, '');
}
