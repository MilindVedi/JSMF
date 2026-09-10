import { BarChart3, Bookmark, BookOpen, CheckCircle2, Timer, XCircle } from "lucide-react";

const FEATURES = [
  {
    icon: BookOpen,
    title: "Full question bank",
    description: "Filter by exam, year, subject, and topic to find exactly what you want to practice.",
  },
  {
    icon: CheckCircle2,
    title: "Instant answers & explanations",
    description: "Every question reveals the correct answer and a clear explanation as soon as you respond.",
  },
  {
    icon: Bookmark,
    title: "Bookmarks",
    description: "Save tricky questions to revisit later without losing your place.",
  },
  {
    icon: XCircle,
    title: "Wrong questions revision",
    description: "Every question you get wrong is automatically queued for focused revision.",
  },
  {
    icon: Timer,
    title: "Custom tests, timed or untimed",
    description: "Build a test from any combination of filters, with an optional exam-like timer.",
  },
  {
    icon: BarChart3,
    title: "Performance statistics",
    description: "See accuracy by subject and topic, and track how your preparation improves.",
  },
];

export function FeatureGrid() {
  return (
    <section id="features" className="py-20 sm:py-28">
      <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-heading text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Everything you need to practice, nothing you don&apos;t
          </h2>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="rounded-xl border border-border bg-card p-6">
              <div className="mb-4 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <feature.icon className="size-5" />
              </div>
              <h3 className="font-heading text-base font-semibold text-foreground">{feature.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
