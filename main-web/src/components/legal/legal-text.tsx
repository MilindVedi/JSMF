import type { ReactNode } from "react";
import Link from "next/link";

/**
 * Renders a legal section body. The body is plain text written in the admin
 * panel — never HTML — and it is rendered as React text only, so nothing typed
 * there can inject markup into the page:
 *
 * - blank lines separate blocks;
 * - a block whose every line starts with "- " is a bulleted list, anything
 *   else a paragraph (single newlines inside it become spaces);
 * - `[text](url)` is a link when the url is internal ("/…"), https or mailto,
 *   and plain text otherwise; `**text**` is bold.
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
                <li key={i}>{inline(line.slice(2).trim())}</li>
              ))}
            </ul>
          );
        }
        return <p key={index}>{inline(lines.join(" "))}</p>;
      })}
    </>
  );
}

const INLINE = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*/g;

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;

  for (const match of text.matchAll(INLINE)) {
    const start = match.index;
    if (start > last) out.push(text.slice(last, start));

    const [whole, label, url, bold] = match;
    if (bold !== undefined) out.push(<strong key={start}>{bold}</strong>);
    else out.push(link(label, url, start) ?? label);

    last = start + whole.length;
  }

  if (last < text.length) out.push(text.slice(last));
  return out;
}

const LINK_CLASS = "font-semibold text-primary";

function link(label: string, url: string, key: number): ReactNode | null {
  // "//host" is protocol-relative — an external link dressed as an internal one.
  if (url.startsWith("/") && !url.startsWith("//")) {
    return (
      <Link key={key} href={url} className={LINK_CLASS}>
        {label}
      </Link>
    );
  }
  if (url.startsWith("https://")) {
    return (
      <a key={key} href={url} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
        {label}
      </a>
    );
  }
  if (url.startsWith("mailto:")) {
    return (
      <a key={key} href={url} className={LINK_CLASS}>
        {label}
      </a>
    );
  }
  return null;
}
