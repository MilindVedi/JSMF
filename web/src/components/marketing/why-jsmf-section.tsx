import { ShieldCheck, Sparkles } from "lucide-react";
import { DoctorAvatarPlaceholder } from "./doctor-avatar-placeholder";

export function WhyJsmfSection() {
  return (
    <section className="border-y border-border bg-card py-20 sm:py-28">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-10 px-4 sm:px-6 lg:flex-row lg:items-start">
        <div className="lg:w-1/3">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
            <Sparkles className="size-3.5" />
            Why JSMF
          </div>
          <h2 className="font-heading text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Built differently, on purpose
          </h2>
        </div>

        <div className="flex flex-col gap-6 lg:w-2/3">
          <p className="prose-reading text-foreground">
            Most question banks in this space paraphrase or repackage the same recycled content.
            JSMF&apos;s questions are original — each one is authored from scratch by a licensed
            medical professional around a concept identified across independent recall reports,
            not copied or reworded from any existing source.
          </p>
          <p className="prose-reading text-muted-foreground">
            We&apos;re upfront about what &quot;memory-based&quot; means, we keep the reading
            experience clean and distraction-free for long study sessions, and our subscription
            plans are built around clear entitlements — you always know exactly what an exam and
            a plan unlocks for you.
          </p>
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <ShieldCheck className="size-4 text-primary" />
            Original content. Transparent framing. No surprises.
          </div>

          <div className="flex items-center gap-3 border-t border-border pt-5">
            <DoctorAvatarPlaceholder size="sm" badge={false} />
            <div>
              <p className="text-sm font-semibold text-foreground">Dr. Angad Rai</p>
              <p className="text-xs text-muted-foreground">Founder · Medical Lead</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
