"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Award,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileQuestion,
  FileText,
  Library,
  Loader2,
  MonitorPlay,
  Play,
  Send,
  Sparkles,
  Stethoscope,
} from "lucide-react";
import { RegisterDialog } from "@/components/register-dialog";
import { SiteLayout } from "@/components/site";
import { InstagramIcon, YouTubeIcon } from "@/components/social-icons";
import { Button, buttonVariants } from "@/components/ui/button";
import { sessionsApi } from "@/lib/api/sessions";
import type { LiveSession, SessionLanding } from "@/lib/api/types";
import { dateLabel, formatMoney, timeLabel } from "@/lib/format";
import { credentials, links } from "@/lib/site-content";

/**
 * The main website's home page.
 *
 * Everything about the session — title, date, price, seats, what you'll learn —
 * comes from the API and is edited in the admin panel; nothing here needs a
 * deploy to announce the next one. When no session is upcoming, every CTA
 * falls back to the Telegram channel rather than a dead "Reserve" button.
 */
export function Landing() {
  const router = useRouter();
  const params = useSearchParams();
  const [data, setData] = useState<SessionLanding | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);

  // Back from Google sign-in mid-registration (`?register=1`): reopen the
  // dialog once the session has loaded, and drop the flag from the URL so a
  // refresh does not reopen it again.
  const resume = params.get("register") === "1";

  useEffect(() => {
    sessionsApi
      .landing()
      .then((result) => {
        setData(result);
        if (resume && result.upcoming?.registrationOpen) {
          setOpen(true);
          router.replace("/", { scroll: false });
        }
      })
      .catch(() => setFailed(true));
  }, [resume, router]);

  const close = useCallback(() => setOpen(false), []);

  const session = data?.upcoming ?? null;
  const live = Boolean(session?.registrationOpen);
  const full = Boolean(session && !session.registrationOpen);
  const loading = !data && !failed;

  return (
    <SiteLayout>
      {session && <RegisterDialog open={open} onClose={close} session={session} />}

      {/* Hero */}
      <section className="border-b border-border bg-card">
        <div className="mx-auto grid max-w-7xl items-center gap-14 px-5 py-14 lg:grid-cols-12 lg:px-8 lg:py-20">
          <div className="lg:col-span-7">
            <span className="eyebrow">
              <Sparkles size={13} /> Doctor-led preparation · JSMF
            </span>
            <h1 className="mt-6 max-w-2xl font-display text-5xl font-semibold leading-[1.06] text-brand-deep md:text-6xl">
              Prepare smarter, with a doctor who has just done it.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
              Dr. Angad Rai cleared NEET-PG 2026 with AIR 925. He shares the exact revision system
              behind it — live sessions, high-yield material, and honest guidance through JSMF.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-4">
              {loading ? (
                <Button size="xl" className="text-base" disabled>
                  <Loader2 size={18} className="animate-spin" /> Loading session
                </Button>
              ) : live ? (
                <Button size="xl" className="cta-spot text-base" onClick={() => setOpen(true)}>
                  Reserve your spot <ArrowRight size={19} strokeWidth={2.4} />
                </Button>
              ) : (
                <a href={links.telegram} target="_blank" rel="noreferrer" className={buttonVariants({ size: "xl", className: "cta-spot text-base" })}>
                  <Send size={18} /> Get notified on Telegram
                </a>
              )}
              <a href={links.interviewWatch} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "secondary", size: "lg" })}>
                <Play size={16} /> Watch the interview
              </a>
            </div>
            {live && session && <SeatsLine session={session} className="mt-4" />}

            <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              <span className="flex items-center gap-2 text-primary"><Award size={14} /> AIR 925 · NEET-PG 2026</span>
              <span className="flex items-center gap-2 text-primary"><Award size={14} /> AIR 9 · FMGE 2023</span>
              <span className="flex items-center gap-2 text-primary"><Stethoscope size={14} /> MBBS · Bronze Medalist</span>
              <span className="flex items-center gap-2"><MonitorPlay size={14} /> Live sessions</span>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-sm lg:col-span-5">
            <div className="portrait-frame">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/angad-bench.png" alt="Dr. Angad Rai" width={1536} height={1024} className="h-full w-full object-cover" />
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
          <span className="inline-flex items-center gap-2 rounded-full bg-brand-line px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide">
            {session ? (full ? "Registration closed" : "Upcoming live session") : "Next session announced soon"}
          </span>
          <h2 className="mt-5 max-w-2xl font-display text-3xl font-semibold leading-tight md:text-4xl">
            {loading ? "Loading the next session…" : session ? session.title : "The last session has wrapped up"}
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-relaxed opacity-80">
            {session
              ? session.tagline
              : loading
                ? ""
                : "Join the Telegram channel to be the first to know when the next live session opens."}
          </p>

          {session ? (
            <div className="mt-12 grid gap-8 lg:grid-cols-12">
              <div className="lg:col-span-7">
                {session.highlights.length > 0 && (
                  <>
                    <p className="text-[11px] font-bold uppercase tracking-wide opacity-70">What you&apos;ll learn</p>
                    <ul className="mt-5 grid gap-3">
                      {session.highlights.map((item) => (
                        <li key={item} className="flex gap-3 text-sm leading-relaxed opacity-90">
                          <CheckCircle2 size={17} className="mt-0.5 shrink-0" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>

              <div className="lg:col-span-5">
                <SessionCard session={session} onRegister={() => setOpen(true)} />
              </div>
            </div>
          ) : (
            !loading && (
              <div className="mt-10 flex flex-wrap gap-3">
                <a href={links.telegram} target="_blank" rel="noreferrer" className={buttonVariants({ size: "lg" })}>
                  <Send size={16} /> Join Telegram
                </a>
                {data?.previous?.recordingUrl && (
                  <a href={data.previous.recordingUrl} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "secondary", size: "lg" })}>
                    <Play size={16} /> Watch the last recording
                  </a>
                )}
              </div>
            )
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
              {credentials.map((item) => (
                <span key={item} className="credential-chip">{item}</span>
              ))}
              <span className="credential-chip">Mentor · JSMF</span>
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href={links.telegram} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "secondary" })}><Send size={15} /> Telegram</a>
              <a href={links.youtube} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "secondary" })}><YouTubeIcon size={15} /> YouTube</a>
              <a href={links.instagram} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "secondary" })}><InstagramIcon size={15} /> Instagram</a>
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
                <h3 className="mt-2 font-display text-lg font-semibold text-brand-deep">Dr. Angad Rai on his NEET-PG journey</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  The routine, the mistakes, and what he would do differently — in his own words.
                </p>
                <a href={links.interviewWatch} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "ghost", size: "sm", className: "mt-4" })}>
                  Watch on YouTube <ArrowRight size={14} />
                </a>
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
            JSMF brings together live mentorship sessions, high-yield revision material and question
            practice into a single place — so your preparation stops being scattered across a dozen
            apps, groups and playlists.
          </p>
          <blockquote className="mt-10 font-display text-xl font-medium leading-relaxed text-brand-deep md:text-2xl">
            &ldquo;Solve the right questions, understand why they&apos;re right, and know exactly what to revise.&rdquo;
          </blockquote>
          <p className="mt-4 text-sm font-semibold text-muted-foreground">— Dr. Angad Rai</p>
        </div>
      </section>

      {/* What's coming */}
      <section className="border-b border-border bg-background py-20">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <span className="eyebrow">What&apos;s coming to JSMF</span>
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
                Curated, doctor-written material to support your revision — growing steadily with each
                subject we cover.
              </p>
              <a href={links.store} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "secondary", className: "mt-6" })}>
                Explore resources <ArrowRight size={15} />
              </a>
            </article>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-brand-deep py-20 text-brand-on-deep">
        <div className="mx-auto max-w-3xl px-5 text-center">
          <div className="mx-auto mb-8 h-px w-14 bg-brand-line" />
          <h2 className="font-display text-3xl font-semibold leading-tight md:text-4xl">Ready to start preparing smarter?</h2>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed opacity-80">
            {live && session
              ? `Join Dr. Angad Rai live on ${dateLabel(session.startsAt)}.${session.included.length ? " The revision planner comes with your seat." : ""}`
              : "Follow JSMF so you hear about the next live session the moment it opens."}
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            {live ? (
              <Button size="lg" onClick={() => setOpen(true)}>Reserve your spot <ArrowRight size={17} /></Button>
            ) : (
              <a href={links.telegram} target="_blank" rel="noreferrer" className={buttonVariants({ size: "lg" })}><Send size={16} /> Join Telegram</a>
            )}
            <a href={links.youtube} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "secondary", size: "lg" })}>
              <YouTubeIcon size={16} /> Watch past sessions
            </a>
          </div>
        </div>
      </section>
    </SiteLayout>
  );
}

function SeatsLine({ session, className = "" }: { session: LiveSession; className?: string }) {
  if (session.seatsRemaining === null) return null;
  return (
    <p className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground ${className}`}>
      <Sparkles size={13} className="text-primary" />
      <span className="text-destructive">
        Only {session.seatsRemaining} {session.seatsRemaining === 1 ? "seat" : "seats"} left
      </span>
    </p>
  );
}

function SessionCard({ session, onRegister }: { session: LiveSession; onRegister: () => void }) {
  const price = formatMoney(session.priceAmountMinor, session.currency);
  const compareAt = formatMoney(session.compareAtAmountMinor, session.currency);

  return (
    <div className="rounded-3xl border border-border bg-card p-7 text-foreground shadow-editorial">
      <div className="grid gap-4">
        <Detail icon={<CalendarDays size={18} />} label="Date" value={dateLabel(session.startsAt)} />
        <Detail icon={<Clock size={18} />} label="Time" value={timeLabel(session.startsAt, session.durationMinutes)} />
        <Detail icon={<MonitorPlay size={18} />} label="Where" value={session.platformLabel} />
      </div>

      {session.perkText && (
        <div className="mt-6 flex gap-3 rounded-2xl bg-accent p-4">
          <FileText size={18} className="mt-0.5 shrink-0 text-primary" />
          <p className="text-xs font-semibold leading-relaxed text-accent-foreground">
            {session.perkText}
            {session.included.length > 0 && (
              <span className="mt-1 block font-medium opacity-80">
                Added to your JSMF account when you register — sign up is required to get it.
              </span>
            )}
          </p>
        </div>
      )}

      <div className="mt-6 flex items-baseline justify-center gap-2">
        <span className="font-display text-3xl font-semibold text-brand-deep">{price}</span>
        {compareAt && <span className="text-sm text-muted-foreground line-through">{compareAt}</span>}
      </div>

      {session.registrationOpen ? (
        <Button size="lg" className="mt-4 w-full" onClick={onRegister}>
          Reserve for {price} <ArrowRight size={16} />
        </Button>
      ) : (
        <Button size="lg" className="mt-4 w-full" disabled>
          {session.seatsRemaining === 0 ? "This session is full" : "Registration closed"}
        </Button>
      )}
      <p className="mt-3 text-center text-[11px] font-semibold text-muted-foreground">
        Secure payment by Razorpay
        {session.seatsRemaining !== null && session.registrationOpen && (
          <>
            {" · "}
            <span className="font-bold text-destructive">
              Only {session.seatsRemaining} {session.seatsRemaining === 1 ? "seat" : "seats"} remaining
            </span>
          </>
        )}
      </p>
      <a href={links.telegram} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "ghost", size: "sm", className: "mt-2 w-full" })}>
        <Send size={14} /> Join Telegram for updates
      </a>
    </div>
  );
}

function Detail({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 shrink-0 text-primary">{icon}</span>
      <div>
        <p className="text-[10px] font-bold uppercase text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold text-brand-deep">{value}</p>
      </div>
    </div>
  );
}
