import { Compass, Lightbulb, ListChecks, TrendingUp } from "lucide-react";

const STEPS = [
  {
    icon: Compass,
    title: "Pick your exam",
    description: "Choose NEET-PG, FMGE, or INI-CET as your primary focus — switch anytime.",
  },
  {
    icon: ListChecks,
    title: "Practice by subject or build a custom test",
    description:
      "Browse the question bank by exam, year, subject, and topic, or assemble a timed custom test.",
  },
  {
    icon: Lightbulb,
    title: "Get instant explanations",
    description: "Every question comes with a clear, doctor-written explanation the moment you answer.",
  },
  {
    icon: TrendingUp,
    title: "Track your progress and revise",
    description: "Bookmark questions, revisit wrong answers, and watch your accuracy improve over time.",
  },
];

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="border-b border-border bg-card py-20 sm:py-28">
      <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-heading text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            How JSMF works
          </h2>
        </div>

        <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <div key={step.title} className="flex flex-col gap-3">
              <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <step.icon className="size-5" />
              </div>
              <div className="flex items-center gap-2">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                  {i + 1}
                </span>
                <h3 className="font-heading text-base font-semibold text-foreground">{step.title}</h3>
              </div>
              <p className="text-sm text-muted-foreground">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
