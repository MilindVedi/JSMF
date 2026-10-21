import { ShieldCheck, Sparkles } from "lucide-react";

export function WhyJsmfSection() {
  return (
    <section className="bg-brand-deep py-20 text-brand-on-deep sm:py-28">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-10 px-4 sm:px-6 lg:flex-row lg:items-start">
        <div className="lg:w-1/3">
          <div className="inline-flex items-center gap-2 rounded-full bg-brand-line px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide">
            <Sparkles className="size-3.5" />
            Why JSMF
          </div>
          <h2 className="mt-5 font-display text-3xl font-semibold leading-tight sm:text-4xl">
            Built differently, on purpose
          </h2>
        </div>

        <div className="flex flex-col gap-6 lg:w-2/3">
          <p className="prose-reading">
            Most question banks in this space paraphrase or repackage the same recycled content.
            JSMF&apos;s questions are original — each one is authored from scratch by a licensed
            medical professional around a concept identified across independent recall reports,
            not copied or reworded from any existing source.
          </p>
          <p className="prose-reading opacity-80">
            We&apos;re upfront about what &quot;memory-based&quot; means, we keep the reading
            experience clean and distraction-free for long study sessions, and our subscription
            plans are built around clear entitlements — you always know exactly what an exam and
            a plan unlocks for you.
          </p>
          <div className="flex items-center gap-2 text-sm font-medium">
            <ShieldCheck className="size-4" />
            Original content. Transparent framing. No surprises.
          </div>

          <div className="flex items-center gap-3 border-t border-brand-line pt-5">
            {/* eslint-disable-next-line @next/next/no-img-element -- build-time constant from public/ */}
            <img src="/dr-angad-rai-v2.jpg" alt="Dr. Angad Rai" width={40} height={40} className="size-10 rounded-full object-cover object-top" />
            <div>
              <p className="text-sm font-semibold">Dr. Angad Rai</p>
              <p className="text-xs opacity-70">Founder · Medical Lead</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
