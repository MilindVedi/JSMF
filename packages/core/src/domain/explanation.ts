import type { SessionQuestion } from "./types";

/**
 * An answered question's explanation as both apps show it, in this order:
 *
 * 1. `body` — the free-form explanation;
 * 2. `correctWhy` — why the right option is right, when written on its own;
 * 3. `wrongWhy` — why each other option is wrong, in the order the options are
 *    shown (so it follows this session's shuffle);
 * 4. `pearls` — high-yield pearls / buzzwords;
 * 5. `quickRevision` — the recap.
 *
 * Questions imported before these parts existed have everything in `body`
 * and empty parts, so they show exactly as before.
 */
export interface ExplanationParts {
  body: string;
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
    correctWhy: withWhy.find((entry) => entry.optionId === question.correctOptionId) ?? null,
    wrongWhy: withWhy.filter((entry) => entry.optionId !== question.correctOptionId),
    pearls: (question.pearls ?? []).map((pearl) => pearl.trim()).filter(Boolean),
    quickRevision: question.quickRevision?.trim() || null,
  };
}
