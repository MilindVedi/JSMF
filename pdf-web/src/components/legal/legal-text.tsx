import Link from "next/link";
import type { ReactNode } from "react";
import { formatLegalDate, type LegalSection } from "@/lib/legal";

/**
 * Renders a legal section body, which is plain text — never HTML — so nothing
 * in a document can inject markup. The format is deliberately tiny:
 *
 * - blank lines separate blocks;
 * - a block whose every line starts with "- " is a bulleted list;
 * - anything else is a paragraph (single newlines read as spaces);
 * - `[text](url)` is a link, for `/internal`, `https://` and `mailto:` only;
 * - `**bold**` is bold.
 *
 * The admin preview uses this same component, so a draft looks exactly as it
 * will once published.
 */
export function LegalText({ body }: { body: string }) {
  const blocks = body
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  return (
    <>
      {blocks.map((block, index) => {
        const lines = block.split("\n").map((line) => line.trim());
        if (lines.every((line) => line.startsWith("- "))) {
          return (
            <ul key={index} className="list-disc space-y-1 pl-5">
              {lines.map((line, i) => (
                <li key={i}>{inline(line.slice(2))}</li>
              ))}
            </ul>
          );
        }
        return <p key={index}>{inline(lines.join(" "))}</p>;
      })}
    </>
  );
}

/** A document's sections, numbered in display order. A blank heading still gets its body. */
export function LegalSections({ sections }: { sections: LegalSection[] }) {
  // Only headed sections take a number, so a headingless preamble does not
  // turn the first real section into "2.".
  const numbers = sections.map((_, i) => sections.slice(0, i + 1).filter((s) => s.heading).length);
  return (
    <div className="space-y-6 text-sm leading-relaxed text-foreground">
      {sections.map((section, index) => {
        const number = numbers[index];
        return (
          <section key={section.id} className="space-y-3">
            {section.heading && (
              <h2 className="font-display text-lg font-semibold text-brand-deep">
                {number}. {section.heading}
              </h2>
            )}
            <LegalText body={section.body} />
          </section>
        );
      })}
    </div>
  );
}

/** The title block every rendered document opens with. */
export function LegalHeading({
  title,
  version,
  effectiveAt,
}: {
  title: string;
  version: string;
  effectiveAt: string;
}) {
  return (
    <>
      <h1 className="font-display text-3xl font-semibold text-brand-deep">{title}</h1>
      <p className="mt-2 text-xs text-muted-foreground">
        Version {version} · Effective {formatLegalDate(effectiveAt)}
      </p>
    </>
  );
}

const LINK_CLASS = "font-semibold text-primary";

const INLINE = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*/g;

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;

  for (const match of text.matchAll(INLINE)) {
    const start = match.index ?? 0;
    if (start > last) out.push(text.slice(last, start));

    const [whole, label, url, bold] = match;
    if (bold !== undefined) {
      out.push(<strong key={key++}>{bold}</strong>);
    } else if (url.startsWith("/") && !url.startsWith("//")) {
      out.push(
        <Link key={key++} href={url} className={LINK_CLASS}>
          {label}
        </Link>,
      );
    } else if (url.startsWith("https://")) {
      out.push(
        <a key={key++} href={url} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
          {label}
        </a>,
      );
    } else if (url.startsWith("mailto:")) {
      out.push(
        <a key={key++} href={url} className={LINK_CLASS}>
          {label}
        </a>,
      );
    } else {
      // Not an allowed destination: shown exactly as written, never as a link.
      out.push(whole);
    }
    last = start + whole.length;
  }

  if (last < text.length) out.push(text.slice(last));
  return out;
}
