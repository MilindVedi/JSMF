/**
 * Search over the reader's own library, done in the browser.
 *
 * Why not Postgres full-text search: a library is a few dozen rows at most,
 * already fetched in full to draw the page. Sending each keystroke to the
 * server would add a round trip and a moving result list to search what the
 * browser already holds — and Postgres FTS matches whole stemmed words, so
 * "anat" would not find "Anatomy" while someone is still typing. Matching here
 * is instant, works offline once loaded, and needs no index to maintain.
 *
 * How it matches:
 * - Text is normalised: lower case, accents removed, punctuation as spaces.
 * - Every word typed must match (AND), in any order, against the start of a
 *   word in the item — "rev day" finds "Revision Day 1".
 * - A word of 5+ letters may be one typo off ("anatomi", "revison").
 * - Results are ranked: title over subtitle and the PDFs inside a bundle, over
 *   the session it came with; exact over prefix over typo.
 */

/** Where a word was found, and how much that counts. */
const WEIGHT = { title: 6, subtitle: 3, contents: 3, session: 2, label: 1 } as const;
type Field = keyof typeof WEIGHT;

export interface Searchable {
  title: string;
  subtitle?: string | null;
  /** The titles of the PDFs inside a bundle. */
  contents?: string[];
  /** The session it came with, if any. */
  session?: string | null;
  /** How it was acquired: "Purchased", "Free"… */
  label?: string;
}

interface IndexedDoc<T> {
  item: T;
  order: number;
  words: Array<{ word: string; field: Field }>;
  title: string;
}

export function normalise(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const wordsOf = (text: string | null | undefined) => (text ? normalise(text).split(" ").filter(Boolean) : []);

/** At most one insertion, deletion, substitution or swap of neighbours. */
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) {
    // substitution, or two neighbours swapped
    return a.slice(i + 1) === b.slice(i + 1) || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
  }
  const [longer, shorter] = a.length > b.length ? [a, b] : [b, a];
  return longer.slice(i + 1) === shorter.slice(i);
}

/** How well one typed word matches one word of the item: 0 is not at all. */
function wordScore(typed: string, word: string): number {
  if (word === typed) return 1;
  if (word.startsWith(typed)) return 0.8;
  if (typed.length >= 5) {
    // A typo in a whole word, or in a word still being typed.
    if (withinOneEdit(typed, word) || withinOneEdit(typed, word.slice(0, typed.length))) return 0.5;
  }
  return 0;
}

/** Built once per list, not per keystroke. */
export function buildIndex<T>(items: T[], describe: (item: T) => Searchable): IndexedDoc<T>[] {
  return items.map((item, order) => {
    const doc = describe(item);
    const words: IndexedDoc<T>["words"] = [];
    const add = (field: Field, text: string | null | undefined) =>
      wordsOf(text).forEach((word) => words.push({ word, field }));
    add("title", doc.title);
    add("subtitle", doc.subtitle);
    doc.contents?.forEach((text) => add("contents", text));
    add("session", doc.session);
    add("label", doc.label);
    return { item, order, words, title: normalise(doc.title) };
  });
}

/** The items matching `query`, best first. An empty query returns them all, in their order. */
export function search<T>(index: IndexedDoc<T>[], query: string): T[] {
  const typed = wordsOf(query);
  if (typed.length === 0) return index.map((doc) => doc.item);

  const phrase = typed.join(" ");
  const scored: Array<{ doc: IndexedDoc<T>; score: number }> = [];

  for (const doc of index) {
    let score = 0;
    let all = true;
    for (const t of typed) {
      let best = 0;
      for (const { word, field } of doc.words) {
        const s = wordScore(t, word) * WEIGHT[field];
        if (s > best) best = s;
      }
      if (best === 0) {
        all = false;
        break;
      }
      score += best;
    }
    if (!all) continue;
    // The words typed, together and in order, in the title: what they most
    // likely meant.
    if (doc.title.includes(phrase)) score += WEIGHT.title;
    scored.push({ doc, score });
  }

  return scored
    .sort((a, b) => b.score - a.score || a.doc.order - b.doc.order)
    .map(({ doc }) => doc.item);
}
