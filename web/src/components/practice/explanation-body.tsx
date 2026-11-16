import type { ReactNode } from "react";
import { explanationParts, type ExplanationBlock, type SessionQuestion } from "@jsmf/core/domain";
import { FigurePlaceholder } from "@/components/common/figure-placeholder";
import { QuestionImage } from "./question-image";

/**
 * An answered question's explanation in the order both apps show it
 * (explanationParts; docs/pyq/explanation-pattern.md): the main explanation,
 * why the right option is right (only when written on its own), the
 * explanation's headed sections, its image, why the others are wrong, pearls,
 * quick revision. A question with only plain explanation text shows as before.
 */
export function ExplanationBody({ question }: { question: SessionQuestion }) {
  const parts = explanationParts(question);
  return (
    <div className="space-y-4">
      {parts.intro.length > 0 && (
        <div className="prose-reading space-y-3 text-foreground">
          <Blocks blocks={parts.intro} />
        </div>
      )}

      {parts.correctWhy && (
        <Section title={`Why “${parts.correctWhy.text}” is right`}>
          <p className="whitespace-pre-line">{parts.correctWhy.why}</p>
        </Section>
      )}

      {parts.sections.map((section, index) => (
        <Section key={index} title={section.title}>
          <div className="space-y-3">
            <Blocks blocks={section.blocks} />
          </div>
        </Section>
      ))}

      {question.explanationImageUrl && <QuestionImage src={question.explanationImageUrl} alt="Explanation image" />}
      {question.explanationFigure && <FigurePlaceholder figure={question.explanationFigure} />}

      {parts.wrongWhy.length > 0 && (
        <Section title="Why the other options are wrong">
          <ul className="space-y-2.5">
            {parts.wrongWhy.map((entry) => (
              <li key={entry.optionId}>
                <span className="font-semibold">{entry.text}</span>
                <span className="block whitespace-pre-line">{entry.why}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {parts.pearls.length > 0 && (
        <Section title="High-yield pearls">
          <ul className="list-disc space-y-1 pl-5 marker:text-muted-foreground">
            {parts.pearls.map((pearl, index) => (
              <li key={index}>{pearl}</li>
            ))}
          </ul>
        </Section>
      )}

      {parts.quickRevision && (
        <Section title="Quick revision">
          <p className="whitespace-pre-line">{parts.quickRevision}</p>
        </Section>
      )}
    </div>
  );
}

/** Paragraphs and lists of the explanation text, as written. */
function Blocks({ blocks }: { blocks: ExplanationBlock[] }) {
  return blocks.map((block, index) =>
    block.kind === "paragraph" ? (
      <p key={index} className="whitespace-pre-line">
        {block.text}
      </p>
    ) : block.kind === "bullets" ? (
      <ul key={index} className="list-disc space-y-1 pl-5 marker:text-muted-foreground">
        {block.items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    ) : (
      <ol key={index} start={block.start} className="list-decimal space-y-1 pl-5 marker:text-muted-foreground">
        {block.items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ol>
    ),
  );
}

/** A rule and a small-caps title set each part apart from the main explanation above it. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2 border-t border-foreground/10 pt-4">
      <h3 className="text-xs font-semibold tracking-wider text-primary uppercase">{title}</h3>
      <div className="prose-reading text-foreground">{children}</div>
    </section>
  );
}
