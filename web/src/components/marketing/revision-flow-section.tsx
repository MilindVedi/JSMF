import { MiniExplanationMock, MiniQuestionMock, MiniRevisionListMock } from "./product-mockups";

const STEPS = [
  {
    step: "1",
    title: "Practice",
    description: "Work through memory-based PYQs filtered by exam, year, subject, or topic.",
    mock: <MiniQuestionMock />,
  },
  {
    step: "2",
    title: "Review",
    description: "See the correct answer and a clear explanation the moment you respond.",
    mock: <MiniExplanationMock />,
  },
  {
    step: "3",
    title: "Revise",
    description: "Wrong answers and bookmarks queue themselves automatically for focused revision.",
    mock: <MiniRevisionListMock />,
  },
];

export function RevisionFlowSection() {
  return (
    <section className="border-y border-border bg-card py-20 sm:py-28">
      <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-heading text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Built for the way you revise
          </h2>
          <p className="mt-3 text-muted-foreground">
            Not just a question bank — a loop that turns practice into progress.
          </p>
        </div>

        <div className="mt-12 grid gap-8 sm:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.step}>
              <div className="mb-4 flex items-center gap-2">
                <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  {s.step}
                </span>
                <h3 className="font-heading text-base font-semibold text-foreground">{s.title}</h3>
              </div>
              {s.mock}
              <p className="mt-3 text-sm text-muted-foreground">{s.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
