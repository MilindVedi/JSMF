import Link from "next/link";
import { ArrowRight, Stethoscope } from "lucide-react";
import { storeButton } from "@/components/ui/store-button";
import { DoctorPortrait } from "./doctor-portrait";

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />

      <div className="relative mx-auto w-full max-w-[1280px] px-4 pt-10 pb-20 sm:px-6 sm:pt-14 sm:pb-28">
        {/* The words get a little more than half the row from lg up. At an even
            split the headline broke over four short lines against a tall
            poster; the extra tenth lets it settle into three without the
            poster losing anything (its own column is capped at max-w-md and
            pushed right, so the gap absorbs the difference). Below lg the two
            stack and the ratio does not apply. */}
        <div className="grid gap-14 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-10">
          <div className="flex flex-col items-start gap-8">
            <span className="eyebrow">
              <Stethoscope size={13} /> Built for NEET-PG, FMGE & INI-CET
            </span>

            {/* A step down from 3.25rem: at the old size it still wrapped four
                ways in the wider column, which reads as a stack of fragments
                rather than a sentence. lg is the narrowest the column ever
                gets — the two have just split but the window is still only
                ~1024px — so it steps back down there and takes the largest
                size only at xl. */}
            <h1 className="max-w-2xl font-display text-4xl font-semibold leading-[1.08] text-brand-deep dark:text-foreground sm:text-[2.75rem] lg:text-4xl xl:text-5xl">
              Practice the questions that actually show up in your exam.
            </h1>

            <p className="-mt-3 font-display text-lg font-semibold text-primary sm:text-xl">
              Practice PYQs. Master concepts. Prepare smarter.
            </p>

            <p className="max-w-lg text-lg text-muted-foreground sm:text-xl">
              Doctor-authored questions built from independently identified recall patterns across
              recent exam cycles — not claimed reproductions of official papers.
            </p>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="/signup"
                className="cta-spot flex items-center justify-center gap-2.5 rounded-full px-8 py-4 font-display text-lg font-semibold text-white"
              >
                <span className="cta-shine" aria-hidden />
                Start practicing free
                <ArrowRight size={20} strokeWidth={2.4} className="cta-arrow transition-transform duration-300" />
              </Link>
              <Link
                href="#how-it-works"
                className={storeButton({ variant: "secondary", size: "lg" })}
              >
                See how it works
              </Link>
            </div>
          </div>

          {/* Right column: the person behind it, the same poster as on jsmf.me. */}
          <div className="w-full pb-8 sm:pr-6 lg:ml-auto lg:max-w-md">
            <DoctorPortrait />
          </div>
        </div>
      </div>
    </section>
  );
}
