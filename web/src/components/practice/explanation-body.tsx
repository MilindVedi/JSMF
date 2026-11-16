import type { ReactNode } from "react";
import { explanationParts, type SessionQuestion } from "@jsmf/core/domain";
import { FigurePlaceholder } from "@/components/common/figure-placeholder";
import { QuestionImage } from "./question-image";

/**
 * An answered question's explanation in the sections both apps show, in
 * explanationParts' order: the explanation, why the right option is right
 * (when written on its own), why the others are wrong, pearls, quick revision.
 * A question with only an explanation shows exactly as before.
 */
export function ExplanationBody({ question }: { question: SessionQuestion }) {
  const parts = explanationParts(question);
  return (
    <div className="space-y-4">
      <p className="prose-reading whitespace-pre-line text-foreground">{parts.body}</p>
      {question.explanationImageUrl && <QuestionImage src={question.explanationImageUrl} alt="Explanation image" />}
      {question.explanationFigure && <FigurePlaceholder figure={question.explanationFigure} />}

      {parts.correctWhy && (
        <Section title={`Why “${parts.correctWhy.text}” is right`}>
          <p className="whitespace-pre-line">{parts.correctWhy.why}</p>
        </Section>
      )}

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

/** A rule and a small-caps title set each part apart from the long explanation above it. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2 border-t border-foreground/10 pt-4">
      <h3 className="text-xs font-semibold tracking-wider text-primary uppercase">{title}</h3>
      <div className="prose-reading text-foreground">{children}</div>
    </section>
  );
}
