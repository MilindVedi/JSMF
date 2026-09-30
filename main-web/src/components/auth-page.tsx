"use client";

import Link from "next/link";
import { CheckCircle2, ShieldCheck, Sparkles } from "lucide-react";
import { SiteLayout } from "@/components/site";
import { GoogleButton } from "@/components/ui/google-button";
import { googleAuth } from "@/lib/api/auth";

const BENEFITS = [
  "Reserve your seat at live sessions",
  "Get the free planner in your JSMF library",
  "One account across the JSMF store",
];

/**
 * Google is the only way in on the main website, as the design shows. The
 * account is the same one the store at store.jsmf.me uses, so whatever comes
 * with a session seat is waiting there too.
 */
export function AuthPage({ mode }: { mode: "login" | "signup" }) {
  const signup = mode === "signup";

  return (
    <SiteLayout>
      <section className="auth-stage">
        <div className="auth-aside">
          <span className="eyebrow"><ShieldCheck size={14} /> Secure access</span>
          <h1 className="font-display text-4xl font-semibold leading-tight text-brand-deep md:text-5xl">
            Your seat, your planner, one account.
          </h1>
          <p className="max-w-md text-base leading-relaxed text-muted-foreground">
            Sign up once to register for live sessions with Dr. Angad Rai and keep everything that comes with them.
          </p>
          <div className="space-y-3 text-sm text-foreground">
            {BENEFITS.map((item) => (
              <p key={item} className="flex items-center gap-2">
                <CheckCircle2 size={17} className="text-success" />
                {item}
              </p>
            ))}
          </div>
        </div>

        <div className="auth-card">
          <p className="mb-2 text-xs font-bold uppercase text-primary">JSMF account</p>
          <h2 className="font-display text-2xl font-semibold text-brand-deep">
            {signup ? "Create your account" : "Welcome back"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {signup ? "Required to reserve a seat and receive the free PDF." : "Sign in to reserve your seat."}
          </p>

          <div className="relative mt-6 rounded-2xl border border-primary/25 bg-accent/60 p-4 shadow-editorial">
            <span className="absolute -top-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-primary px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
              <Sparkles size={11} /> Recommended
            </span>
            <GoogleButton
              className="w-full"
              label={signup ? "Sign up with Google" : "Sign in with Google"}
              onClick={() => googleAuth.start()}
            />
            <p className="mt-2.5 text-center text-xs leading-relaxed text-muted-foreground">One tap — no password to remember.</p>
          </div>

          <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
            We use Google sign-in only — it keeps your account secure and tied to an email you already trust.
          </p>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            {signup ? "Already have an account?" : "New here?"}{" "}
            <Link href={signup ? "/account/login" : "/account/signup"} className="font-semibold text-primary hover:underline">
              {signup ? "Sign in" : "Create an account"}
            </Link>
          </p>
        </div>
      </section>
    </SiteLayout>
  );
}
