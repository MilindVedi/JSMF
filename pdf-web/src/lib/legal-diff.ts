import { APP_LABEL, type LegalSection } from "@/lib/legal";

/**
 * A line diff between two versions of a legal document, for the admin
 * Compare view. Documents are a few hundred lines at most, so a plain LCS
 * table is fast enough and keeps this dependency-free.
 */

export interface DiffLine {
  kind: "same" | "added" | "removed";
  text: string;
}

/**
 * A version as comparable text: `# Title`, then per section
 * `## heading [apps]` and its body lines. App tags are part of the text so a
 * section moving from "all apps" to "Store only" shows up as a change.
 */
export function flattenLegal(title: string, sections: LegalSection[]): string[] {
  const lines = [`# ${title}`];
  for (const section of sections) {
    const apps = section.apps.length
      ? section.apps.map((app) => APP_LABEL[app]).join(", ")
      : "All apps";
    lines.push("", `## ${section.heading || "(no heading)"} [${apps}]`);
    lines.push(...section.body.replace(/\r\n?/g, "\n").split("\n"));
  }
  return lines;
}

/** `before` → `after`, line by line, in reading order. */
export function diffLines(before: string[], after: string[]): DiffLine[] {
  const n = before.length;
  const m = after.length;

  // lcs[i][j] = length of the longest common subsequence of before[i..] and after[j..].
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = before[i] === after[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (before[i] === after[j]) {
      out.push({ kind: "same", text: before[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ kind: "removed", text: before[i++] });
    } else {
      out.push({ kind: "added", text: after[j++] });
    }
  }
  while (i < n) out.push({ kind: "removed", text: before[i++] });
  while (j < m) out.push({ kind: "added", text: after[j++] });
  return out;
}
