import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Award,
  CalendarDays,
  CheckCircle2,
  Clock,
  Download,
  FileQuestion,
  Instagram,
  Library,
  MonitorPlay,
  Play,
  Send,
  Sparkles,
  Stethoscope,
  Youtube,
} from "lucide-react";
import { useState } from "react";
import { StorefrontLayout } from "@/components/storefront";
import { RegisterDialog } from "@/components/register-dialog";
import { Button } from "@/components/ui/button";
import { isSessionUpcoming, links, upcomingSession } from "@/lib/jsmf-event";
import angadBench from "@/assets/angad-bench.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "JSMF — Live sessions with Dr. Angad Rai for NEET-PG, INI-CET & FMGE" },
      { name: "description", content: "Join Dr. Angad Rai (AIR 925, NEET-PG 2026) live. Learn a revision system that works, and get the free high-yield planner." },
      { property: "og:title", content: "JSMF — Prepare smarter with Dr. Angad Rai" },
      { property: "og:description", content: "Reserve your seat for the upcoming free live session on smarter medical exam preparation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  const [open, setOpen] = useState(false);
  const live = isSessionUpcoming(upcomingSession);

  return (
    <StorefrontLayout>
      <RegisterDialog open={open} onClose={() => setOpen(false)} />

      {/* Hero */}
      <section className="border-b border-border bg-card">
        <div className="mx-auto grid max-w-7xl items-center gap-14 px-5 py-14 lg:grid-cols-12 lg:px-8 lg:py-20">
          <div className="lg:col-span-7">
            <span className="eyebrow"><Sparkles size={13} /> Doctor-led preparation · JSMF</span>
            <h1 className="mt-6 max-w-2xl font-display text-5xl font-semibold leading-[1.06] text-brand-deep md:text-6xl">
              Prepare smarter, with a doctor who has just done it.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
              Dr. Angad Rai cleared NEET-PG 2026 with AIR 925. He shares the exact
              revision system behind it — live sessions, high-yield material, and honest
              guidance through JSMF.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-4">
              {live ? (
                <Button size="xl" className="cta-spot text-base" onClick={() => setOpen(true)}>
                  Reserve your spot <ArrowRight size={19} strokeWidth={2.4} />
                </Button>
              ) : (
                <Button asChild size="xl" className="cta-spot text-base">
                  <a href={links.telegram} target="_blank" rel="noreferrer"><Send size={18} /> Get notified on Telegram</a>
                </Button>
              )}
              <Button asChild variant="secondary" size="lg">
                <a href={links.interviewWatch} target="_blank" rel="noreferrer"><Play size={16} /> Watch the interview</a>
              </Button>
            </div>
            {live && (
              <p className="mt-4 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                <Sparkles size={13} className="text-primary" />
                <span className="text-destructive">Only {upcomingSession.seatsRemaining} seats left</span>
              </p>
            )}

            <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              <span className="flex items-center gap-2 text-primary"><Award size={14} /> AIR 925 · NEET-PG 2026</span>
              <span className="flex items-center gap-2 text-primary"><Award size={14} /> AIR 9 · FMGE 2023</span>
              <span className="flex items-center gap-2 text-primary"><Stethoscope size={14} /> MBBS · Bronze Medalist</span>
              <span className="flex items-center gap-2"><MonitorPlay size={14} /> Live &amp; free sessions</span>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-sm lg:col-span-5">
            <div className="portrait-frame">
              <img src={angadBench} alt="Dr. Angad Rai" width={1536} height={1024} loading="eager" className="h-full w-full object-cover" />
              <div className="rank-badge"><Award size={13} /> AIR 925 · NEET-PG 2026</div>
            </div>
            <div className="doctor-credential">
              <p className="text-[10px] font-bold uppercase text-primary">Founder &amp; mentor</p>
              <h2 className="mt-1 font-display font-semibold text-brand-deep">Dr. Angad Rai</h2>
              <p className="mt-1 text-xs text-muted-foreground">MBBS — Medical Lead, JSMF</p>
            </div>
          </div>
        </div>
      </section>

      {/* Upcoming session */}
      <section id="session" className="bg-brand-deep py-20 text-brand-on-deep">
        <div className="mx-auto max-w-6xl px-5 lg:px-8">
          <div className="flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-brand-line px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide">
                {live ? "Upcoming live session" : "Next session announced soon"}
              </span>
              <h2 className="mt-5 max-w-2xl font-display text-3xl font-semibold leading-tight md:text-4xl">
                {live ? upcomingSession.title : "The last session has wrapped up"}
              </h2>
              <p className="mt-4 max-w-2xl text-base leading-relaxed opacity-80">
                {live
                  ? upcomingSession.tagline
                  : "Join the Telegram channel to be the first to know when the next live session opens."}
              </p>
            </div>
          </div>

          {live ? (
            <div className="mt-12 grid gap-8 lg:grid-cols-12">
              <div className="lg:col-span-7">
                <p className="text-[11px] font-bold uppercase tracking-wide opacity-70">What you'll learn</p>
                <ul className="mt-5 grid gap-3">
                  {upcomingSession.learn.map((item) => (
                    <li key={item} className="flex gap-3 text-sm leading-relaxed opacity-90">
                      <CheckCircle2 size={17} className="mt-0.5 shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="lg:col-span-5">
                <div className="rounded-3xl border border-border bg-card p-7 text-foreground shadow-editorial">
                  <div className="grid gap-4">
                    <div className="flex items-start gap-3">
                      <CalendarDays size={18} className="mt-0.5 shrink-0 text-primary" />
                      <div>
                        <p className="text-[10px] font-bold uppercase text-muted-foreground">Date</p>
                        <p className="text-sm font-semibold text-brand-deep">{upcomingSession.dateLabel}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Clock size={18} className="mt-0.5 shrink-0 text-primary" />
                      <div>
                        <p className="text-[10px] font-bold uppercase text-muted-foreground">Time</p>
                        <p className="text-sm font-semibold text-brand-deep">{upcomingSession.timeLabel}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <MonitorPlay size={18} className="mt-0.5 shrink-0 text-primary" />
                      <div>
                        <p className="text-[10px] font-bold uppercase text-muted-foreground">Where</p>
                        <p className="text-sm font-semibold text-brand-deep">{upcomingSession.platform}</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 flex gap-3 rounded-2xl bg-accent p-4">
                    <Download size={18} className="mt-0.5 shrink-0 text-primary" />
                    <p className="text-xs font-semibold leading-relaxed text-accent-foreground">
                      {upcomingSession.perk}
                    </p>
                  </div>

                  <Button size="lg" className="mt-6 w-full" onClick={() => setOpen(true)}>
                    Register for free <ArrowRight size={16} />
                  </Button>
                  <p className="mt-3 text-center text-[11px] font-semibold text-muted-foreground">
                    {upcomingSession.seatsNote} ·{" "}
                    <span className="font-bold text-destructive">
                      Only {upcomingSession.seatsRemaining} seats remaining
                    </span>
                  </p>
                  <Button asChild variant="ghost" size="sm" className="mt-2 w-full">
                    <a href={links.telegram} target="_blank" rel="noreferrer"><Send size={14} /> Join Telegram for the link</a>
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-10 flex flex-wrap gap-3">
              <Button asChild size="lg"><a href={links.telegram} target="_blank" rel="noreferrer"><Send size={16} /> Join Telegram</a></Button>
              {upcomingSession.recordingUrl && (
                <Button asChild variant="secondary" size="lg">
                  <a href={upcomingSession.recordingUrl} target="_blank" rel="noreferrer"><Play size={16} /> Watch the recording</a>
                </Button>
              )}
            </div>
          )}
        </div>
      </section>

      {/* About Dr. Angad + recent interview */}
      <section id="about" className="border-b border-border bg-background py-20">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 lg:grid-cols-12 lg:px-8">
          <div className="lg:col-span-6">
            <span className="eyebrow"><Stethoscope size={13} /> About Dr. Angad Rai</span>
            <h2 className="mt-6 max-w-xl font-display text-3xl font-semibold leading-tight text-brand-deep md:text-4xl">
              A recent aspirant, now a mentor — not a distant faculty member.
            </h2>
            <div className="mt-6 grid gap-4 text-base leading-relaxed text-muted-foreground">
              <p>
                Dr. Angad Rai completed his MBBS as a Bronze Medalist and secured AIR 925 in NEET-PG
                2026. He prepared alongside postings, night duties and the same exhaustion every
                aspirant knows.
              </p>
              <p>
                That is what shapes JSMF. Instead of endless question banks, the focus is on
                understanding why an answer is right, revising in cycles that stick, and cutting the
                noise that costs aspirants months.
              </p>
            </div>
            <div className="mt-8 flex flex-wrap gap-2">
              <span className="credential-chip">AIR 925 · NEET-PG 2026</span>
              <span className="credential-chip">AIR 9 · FMGE 2023</span>
              <span className="credential-chip">MBBS Bronze Medalist</span>
              <span className="credential-chip">Mentor · JSMF</span>
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild variant="secondary"><a href={links.telegram} target="_blank" rel="noreferrer"><Send size={15} /> Telegram</a></Button>
              <Button asChild variant="secondary"><a href={links.youtube} target="_blank" rel="noreferrer"><Youtube size={15} /> YouTube</a></Button>
              <Button asChild variant="secondary"><a href={links.instagram} target="_blank" rel="noreferrer"><Instagram size={15} /> Instagram</a></Button>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-editorial">
              <div className="aspect-video w-full bg-muted">
                <iframe
                  src={links.interviewEmbed}
                  title="Recent interview with Dr. Angad Rai"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
                  allowFullScreen
                  loading="lazy"
                  className="h-full w-full border-0"
                />
              </div>
              <div className="p-6">
                <p className="text-[10px] font-bold uppercase text-primary">Recent interview</p>
                <h3 className="mt-2 font-display text-lg font-semibold text-brand-deep">
                  Dr. Angad Rai on his NEET-PG journey
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  The routine, the mistakes, and what he would do differently — in his own words.
                </p>
                <Button asChild variant="ghost" size="sm" className="mt-4">
                  <a href={links.interviewWatch} target="_blank" rel="noreferrer">Watch on YouTube <ArrowRight size={14} /></a>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* What is JSMF */}
      <section className="border-b border-border bg-card py-20">
        <div className="mx-auto max-w-4xl px-5 text-center lg:px-8">
          <span className="eyebrow mx-auto">What is JSMF?</span>
          <h2 className="mt-6 font-display text-3xl font-semibold leading-tight text-brand-deep md:text-4xl">
            One preparation ecosystem, built by a doctor for aspirants.
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground">
            JSMF brings together live mentorship sessions, high-yield revision material and
            question practice into a single place — so your preparation stops being scattered across
            a dozen apps, groups and playlists.
          </p>
          <blockquote className="mt-10 font-display text-xl font-medium leading-relaxed text-brand-deep md:text-2xl">
            “Solve the right questions, understand why they're right, and know exactly what to revise.”
          </blockquote>
          <p className="mt-4 text-sm font-semibold text-muted-foreground">— Dr. Angad Rai</p>
        </div>
      </section>

      {/* What's coming */}
      <section className="border-b border-border bg-background py-20">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <span className="eyebrow">What's coming to JSMF</span>
          <h2 className="mt-6 max-w-2xl font-display text-3xl font-semibold leading-tight text-brand-deep md:text-4xl">
            More tools. One preparation ecosystem.
          </h2>

          <div className="mt-10 grid gap-5 md:grid-cols-2">
            <article className="rounded-3xl border border-border bg-card p-8 shadow-editorial">
              <div className="grid size-11 place-items-center rounded-2xl bg-accent text-primary"><FileQuestion size={20} /></div>
              <h3 className="mt-5 font-display text-xl font-semibold text-brand-deep">PYQ Practice</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Previous-year questions with reasoning-first explanations, built specifically for
                medical exam preparation.
              </p>
              <span className="mt-6 inline-flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Coming soon
              </span>
            </article>

            <article className="rounded-3xl border border-border bg-card p-8 shadow-editorial">
              <div className="grid size-11 place-items-center rounded-2xl bg-accent text-primary"><Library size={20} /></div>
              <h3 className="mt-5 font-display text-xl font-semibold text-brand-deep">Study Resources</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Curated, doctor-written material to support your revision — growing steadily with
                each subject we cover.
              </p>
              <Button asChild variant="secondary" className="mt-6">
                <Link to="/resources">Explore resources <ArrowRight size={15} /></Link>
              </Button>
            </article>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-brand-deep py-20 text-brand-on-deep">
        <div className="mx-auto max-w-3xl px-5 text-center">
          <div className="mx-auto mb-8 h-px w-14 bg-brand-line" />
          <h2 className="font-display text-3xl font-semibold leading-tight md:text-4xl">
            Ready to start preparing smarter?
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed opacity-80">
            {live
              ? `Join Dr. Angad Rai live on ${upcomingSession.dateLabel}. Free to attend, with the revision planner included.`
              : "Follow JSMF so you hear about the next live session the moment it opens."}
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            {live ? (
              <Button size="lg" onClick={() => setOpen(true)}>Reserve your spot <ArrowRight size={17} /></Button>
            ) : (
              <Button asChild size="lg"><a href={links.telegram} target="_blank" rel="noreferrer"><Send size={16} /> Join Telegram</a></Button>
            )}
            <Button asChild variant="secondary" size="lg">
              <a href={links.youtube} target="_blank" rel="noreferrer"><Youtube size={16} /> Watch past sessions</a>
            </Button>
          </div>
        </div>
      </section>
    </StorefrontLayout>
  );
}
