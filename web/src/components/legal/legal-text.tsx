import Link from "next/link";
import { parseLegalBody, parseLegalInline, type LegalLinkKind } from "@jsmf/core/legal";

/**
 * Renders a legal section body. The body is plain text written in the admin
 * editor, never HTML, and is turned into React elements only — so nothing an
 * editor types can inject markup. The rules for reading it (blocks, bullet
 * lists, `[text](url)` links limited to `/`, `https://` and `mailto:`, and
 * `**bold**`) are `parseLegalBody` / `parseLegalInline` in @jsmf/core, so the
 * mobile app reads a body exactly the same way; this is web's renderer.
 */
export function LegalText({ body }: { body: string }) {
  return (
    <>
      {parseLegalBody(body).map((block, index) =>
        block.kind === "list" ? (
          <ul key={index} className="list-disc space-y-1 pl-5">
            {block.items.map((item, i) => (
              <li key={i}>
                <InlineText text={item} />
              </li>
            ))}
          </ul>
        ) : (
          <p key={index}>
            <InlineText text={block.text} />
          </p>
        )
      )}
    </>
  );
}

const LINK_CLASS = "font-semibold text-primary";

/** Links and bold inside one line of text. */
export function InlineText({ text }: { text: string }) {
  return (
    <>
      {parseLegalInline(text).map((part) => {
        if (part.kind === "text") return part.text;
        if (part.kind === "bold") return <strong key={part.start}>{part.text}</strong>;
        return <LegalLink key={part.start} label={part.label} url={part.url} kind={part.linkKind} />;
      })}
    </>
  );
}

function LegalLink({ label, url, kind }: { label: string; url: string; kind: LegalLinkKind }) {
  if (kind === "internal") {
    return (
      <Link href={url} className={LINK_CLASS}>
        {label}
      </Link>
    );
  }
  if (kind === "external") {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
        {label}
      </a>
    );
  }
  return (
    <a href={url} className={LINK_CLASS}>
      {label}
    </a>
  );
}
