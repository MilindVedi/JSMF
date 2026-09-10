import Link from "next/link";
import { ArrowRight, Medal, Stethoscope, Trophy } from "lucide-react";
import { DoctorPortraitPlaceholder } from "./doctor-portrait-placeholder";
import { DoctorSocialLinks } from "./doctor-social-links";
import { MiniQuestionMock } from "./product-mockups";

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />

      <div className="relative mx-auto w-full max-w-[1280px] px-4 py-20 sm:px-6 sm:py-28">
        <div className="grid gap-14 lg:grid-cols-2 lg:items-center lg:gap-10">
          <div className="flex flex-col items-start gap-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <Stethoscope className="size-3.5 text-primary" />
              Built for NEET-PG, FMGE & INI-CET
            </div>

            <h1 className="max-w-xl font-heading text-4xl font-bold leading-[1.1] tracking-tight text-foreground sm:text-5xl lg:text-[3.25rem]">
              Practice the questions that actually show up in your exam.
            </h1>

            <p className="max-w-lg text-lg text-muted-foreground sm:text-xl">
              Doctor-authored questions built from independently identified recall patterns across
              recent exam cycles — not claimed reproductions of official papers.
            </p>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="/signup"
                className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/80"
              >
                Start practicing free
                <ArrowRight className="size-4" />
              </Link>
              <Link
                href="#how-it-works"
                className="inline-flex h-11 items-center justify-center rounded-lg border border-border bg-background px-6 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
              >
                See how it works
              </Link>
            </div>
          </div>

          {/* Right column: a glimpse of the product, anchored by the person behind it. */}
          <div className="relative mx-auto w-full max-w-sm lg:mx-0 lg:ml-auto">
            <MiniQuestionMock className="absolute -left-4 top-6 hidden w-56 -rotate-6 opacity-90 sm:block lg:-left-10" />

            <div className="relative ml-auto w-64 overflow-hidden rounded-2xl border border-border bg-card shadow-md sm:w-72">
              <DoctorPortraitPlaceholder />
              <div className="p-5 text-center">
                <p className="font-heading text-base font-semibold text-foreground">
                  Built by Dr. Angad Rai
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">MBBS, MD — Medical Lead, JSMF</p>
                <div className="mt-2.5 flex flex-wrap items-center justify-center gap-1.5">
                  <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[0.65rem] font-medium text-accent-foreground">
                    <Trophy className="size-3" />
                    AIR 9 · FMGE 2023
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[0.65rem] font-medium text-accent-foreground">
                    <Medal className="size-3" />
                    MBBS Bronze Medalist
                  </span>
                </div>
                <DoctorSocialLinks variant="emphasized" className="mt-4 justify-center" />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-14 max-w-2xl border-t border-border pt-8 lg:mt-20">
          <p className="prose-reading text-muted-foreground">
            JSMF is a focused practice platform for MBBS graduates preparing for postgraduate and
            licensing exams. Every question is written by a licensed medical professional around a
            concept independently identified from real recall patterns, then reviewed for accuracy
            before publishing. No paraphrased question banks, no copied content — just original
            questions, clear explanations, and a distraction-free way to study.
          </p>
        </div>
      </div>
    </section>
  );
}
