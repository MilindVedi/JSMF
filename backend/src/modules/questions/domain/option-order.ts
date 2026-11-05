import { createHash } from 'node:crypto';

/**
 * The order a student sees a question's options in.
 *
 * Shuffling is per session and per question, and deterministic: the order is
 * derived from the session and question ids, never stored and never random at
 * read time. So a reload, the review screen and a second device all show the
 * very same order, and a new session shows a new one.
 *
 * Some questions must keep their order: an option that refers to other
 * options ("All of the above", "Both A and C") or an explanation that names
 * options by letter would read wrongly once the options move. Those are found
 * on every read, so a better detector applies to the whole bank at once.
 */

export type OptionOrderLock =
  | { reason: 'admin' }
  | { reason: 'options-refer-to-options'; match: string }
  | { reason: 'explanation-names-options'; match: string };

/** An option that only makes sense in its place. */
const OPTION_REFERS_TO_OPTIONS: RegExp[] = [
  // "All of the above", "None of these", "Both of them", "Any of the options"
  /\b(?:all|none|both|neither|any)\s+of\s+(?:the\s+)?(?:above|below|these|them|options|choices)\b/i,
  // "None of above", "All the above"
  /\b(?:all|none|both|neither)\s+(?:the\s+)?(?:above|below)\b/i,
  // "A and C", "B & D", "A, B and C", "Only B or C" — capital letters on their own.
  /(?<![A-Za-z])[A-F]\s*(?:,|&|\/|\band\b|\bor\b)\s*[A-F](?![A-Za-z])/,
  // "Option B", "choice (a)"
  /\b(?:option|choice)s?\s*\(?[A-F]\)?(?![A-Za-z])/i,
];

/** An explanation pointing at an option by its letter. */
const EXPLANATION_NAMES_OPTIONS: RegExp[] = [/\b(?:option|choice)s?\s*\(?[A-F]\)?(?![A-Za-z])/i];

export interface LockableQuestion {
  keepOptionOrder: boolean;
  explanation: string;
  options: { text: string }[];
}

/** Why this question's options are never shuffled, or null when they may be. */
export function optionOrderLock(question: LockableQuestion): OptionOrderLock | null {
  if (question.keepOptionOrder) return { reason: 'admin' };
  for (const option of question.options) {
    const match = firstMatch(option.text, OPTION_REFERS_TO_OPTIONS);
    if (match) return { reason: 'options-refer-to-options', match };
  }
  const match = firstMatch(question.explanation, EXPLANATION_NAMES_OPTIONS);
  return match ? { reason: 'explanation-names-options', match } : null;
}

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const found = pattern.exec(text);
    if (found) return found[0].trim();
  }
  return null;
}

/**
 * `options` in the order `seed` gives them: a Fisher–Yates shuffle driven by
 * SHA-256 of the seed instead of a random source. Same seed, same order.
 */
export function seededOrder<T>(options: readonly T[], seed: string): T[] {
  const result = [...options];
  let digest = createHash('sha256').update(seed).digest();
  let offset = 0;
  for (let i = result.length - 1; i > 0; i -= 1) {
    if (offset + 4 > digest.length) {
      // More than eight swaps — never for 2–6 options, but stay correct.
      digest = createHash('sha256').update(digest).digest();
      offset = 0;
    }
    // A 32-bit draw modulo at most 6: the bias is below one in 700 million.
    const j = digest.readUInt32BE(offset) % (i + 1);
    offset += 4;
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** The seed for one question in one session. */
export function optionSeed(sessionId: string, questionId: string): string {
  return `jsmf:option-order:${sessionId}:${questionId}`;
}
