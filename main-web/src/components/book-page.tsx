"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { SiteLayout } from "@/components/site";
import { FloatingVideo } from "@/components/floating-video";
import { DoctorPortrait, SessionCard } from "@/components/landing";
import { buttonVariants } from "@/components/ui/button";
import { sessionsApi } from "@/lib/api/sessions";
import type { LiveSession } from "@/lib/api/types";
import { links } from "@/lib/site-content";

/**
 * The page shared on Telegram while Razorpay reviews the site.
 *
 * Session content still comes from the admin panel; only payment is handed to
 * a Razorpay-hosted page, so nothing here promises an automatic grant.
 */
export function BookPage({ checkoutUrl }: { checkoutUrl: string | null }) {
  const [session, setSession] = useState<LiveSession | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    sessionsApi
      .landing()
      .then((result) => setSession(result.upcoming))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  const book = () => {
    if (checkoutUrl) window.location.assign(checkoutUrl);
    else router.push("/");
  };

  return (
    <SiteLayout>
      <section className="bg-brand-deep py-16 text-brand-on-deep">
        <div className="mx-auto grid max-w-6xl items-start gap-10 px-5 lg:grid-cols-12 lg:px-8">
          <div className="lg:col-span-7">
            <span className="inline-flex items-center gap-2 rounded-full bg-brand-line px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide">
              {loading ? "Loading" : session ? "Upcoming live session" : "Next session coming soon"}
            </span>

            {loading ? (
              <p className="mt-8 flex items-center gap-2 opacity-80">
                <Loader2 size={18} className="animate-spin" /> Loading the session…
              </p>
            ) : session ? (
              <>
                <h1 className="mt-5 max-w-2xl font-display text-3xl font-semibold leading-tight md:text-4xl">
                  {session.title}
                </h1>
                {session.tagline && (
                  <p className="mt-4 max-w-2xl text-base leading-relaxed opacity-80">{session.tagline}</p>
                )}

                {session.highlights.length > 0 && (
                  <div className="mt-10">
                    <p className="text-[11px] font-bold uppercase tracking-wide opacity-70">What you&apos;ll learn</p>
                    <ul className="mt-5 grid gap-3">
                      {session.highlights.map((item) => {
                        const hasEmoji = /^\p{Extended_Pictographic}/u.test(item) || /^[^\p{L}\p{N}\s]/u.test(item);
                        return (
                          <li key={item} className="flex items-start gap-3 text-sm leading-relaxed opacity-90">
                            {!hasEmoji && <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-primary" />}
                            <span>{item}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {session.description && (
                  <p className="mt-8 max-w-2xl text-sm leading-relaxed whitespace-pre-line opacity-80">
                    {session.description}
                  </p>
                )}
                <p className="mt-8 max-w-2xl text-sm leading-relaxed opacity-80">
                  Use an email address you can access — the joining link and your free PDF are sent there before the
                  session.
                </p>
              </>
            ) : (
              <>
                <h1 className="mt-5 max-w-2xl font-display text-3xl font-semibold leading-tight md:text-4xl">
                  The last session has wrapped up
                </h1>
                <p className="mt-4 max-w-2xl text-base leading-relaxed opacity-80">
                  Join the Telegram channel to hear about the next one first.
                </p>
                <a
                  href={links.telegram}
                  target="_blank"
                  rel="noreferrer"
                  className={buttonVariants({ size: "lg", className: "mt-8" })}
                >
                  <Send size={16} /> Join Telegram
                </a>
              </>
            )}
          </div>

          {session && (
            <div className="lg:col-span-5">
              <SessionCard session={session} onRegister={book} external={Boolean(checkoutUrl)} />
            </div>
          )}
        </div>
      </section>

      {session && (
        <section className="bg-brand-deep pb-20 text-brand-on-deep">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 lg:grid-cols-12 lg:px-8">
            <DoctorPortrait className="lg:col-span-5" />
            <div className="lg:col-span-7">
              <h2 className="max-w-xl font-display text-3xl font-semibold leading-tight md:text-4xl">
                Prepare smarter, with a doctor who has just done it.
              </h2>
              <p className="mt-5 max-w-lg text-base leading-relaxed opacity-80">
                Dr. Angad Rai — NEET-PG 2026, AIR 925. Sharing the revision system behind his preparation — live
                sessions, high-yield material, and honest guidance through JSMF.
              </p>
            </div>
          </div>
        </section>
      )}

      <FloatingVideo />
    </SiteLayout>
  );
}
