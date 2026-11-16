import type { SessionQuestion } from "./types";

/** A block of explanation text: a paragraph, a bullet list or a numbered list. */
export type ExplanationBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "bullets"; items: string[] }
  | { kind: "numbered"; start: number; items: string[] };

/** A headed section of the explanation text ("Clinical clues", "Important clinical tests", …). */
export interface ExplanationSection {
  title: string;
  blocks: ExplanationBlock[];
}

/**
 * The explanation text's own light formatting (docs/pyq/explanation-pattern.md):
 * a line starting `## ` is a section heading, `• ` / `- ` / `* ` a bullet,
 * `1. ` / `1) ` a numbered step; anything else is text, and a blank line ends a
 * paragraph or a list. Nothing else is markup and nothing is ever treated as
 * HTML. Text before the first heading is the main explanation (`intro`); text
 * with no headings is all intro, so older explanations show as before.
 */
export function explanationBlocks(text: string): { intro: ExplanationBlock[]; sections: ExplanationSection[] } {
  const intro: ExplanationBlock[] = [];
  const sections: ExplanationSection[] = [];
  let blocks = intro;
  let paragraph: string[] = [];
  let listOpen = false;

  const endParagraph = () => {
    if (paragraph.length) blocks.push({ kind: "paragraph", text: paragraph.join("\n") });
    paragraph = [];
  };
  const addItem = (kind: "bullets" | "numbered", item: string, number = 1) => {
    endParagraph();
    const last = blocks[blocks.length - 1];
    if (listOpen && last?.kind === kind) last.items.push(item);
    else blocks.push(kind === "bullets" ? { kind, items: [item] } : { kind, start: number, items: [item] });
    listOpen = true;
  };

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      endParagraph();
      listOpen = false;
      continue;
    }
    const heading = /^##\s+(.+)$/.exec(line);
    if (heading) {
      endParagraph();
      listOpen = false;
      const section: ExplanationSection = { title: heading[1].trim(), blocks: [] };
      sections.push(section);
      blocks = section.blocks;
      continue;
    }
    const bullet = /^[•\-*]\s+(.+)$/.exec(line);
    if (bullet) {
      addItem("bullets", bullet[1]);
      continue;
    }
    const numbered = /^(\d{1,2})[.)]\s+(.+)$/.exec(line);
    if (numbered) {
      addItem("numbered", numbered[2], Number(numbered[1]));
      continue;
    }
    listOpen = false;
    paragraph.push(line);
  }
  endParagraph();
  return { intro, sections };
}

/**
 * An answered question's explanation as both apps show it, in this order
 * (docs/pyq/explanation-pattern.md):
 *
 * 1. `intro` — the main explanation: the explanation text before its first
 *    heading ("The correct answer is …" and why);
 * 2. `correctWhy` — why the right option is right, when written on its own
 *    (a fallback; the pattern puts this in the main explanation);
 * 3. `sections` — the explanation text's headed sections (clinical clues,
 *    topic sections);
 * 4. `wrongWhy` — why each other option is wrong, in the order the options are
 *    shown (so it follows this session's shuffle);
 * 5. `pearls` — high-yield pearls;
 * 6. `quickRevision` — the one-line recap.
 *
 * Questions imported before these parts existed have everything in the text
 * and empty parts, so they show exactly as before.
 */
export interface ExplanationParts {
  /** The whole explanation text, unparsed. */
  body: string;
  intro: ExplanationBlock[];
  sections: ExplanationSection[];
  correctWhy: { optionId: string; text: string; why: string } | null;
  wrongWhy: { optionId: string; text: string; why: string }[];
  pearls: string[];
  quickRevision: string | null;
}

export function explanationParts(question: SessionQuestion): ExplanationParts {
  const why = question.optionExplanations ?? {};
  const withWhy = question.options.flatMap((option) => {
    const text = why[option.id]?.trim();
    return text ? [{ optionId: option.id, text: option.text, why: text }] : [];
  });
  return {
    body: question.explanation ?? "",
    ...explanationBlocks(question.explanation ?? ""),
    correctWhy: withWhy.find((entry) => entry.optionId === question.correctOptionId) ?? null,
    wrongWhy: withWhy.filter((entry) => entry.optionId !== question.correctOptionId),
    pearls: (question.pearls ?? []).map((pearl) => pearl.trim()).filter(Boolean),
    quickRevision: question.quickRevision?.trim() || null,
  };
}
