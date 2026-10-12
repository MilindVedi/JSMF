import type { ReactNode } from "react";
import { CheckCircle2, ShieldCheck } from "lucide-react";

/** The left column copy, in main-web's auth-page shape. */
export type AuthAside = {
  eyebrow: string;
  title: string;
  description: string;
  benefits: string[];
};

const PYQ_BENEFITS = [
  "Memory-based PYQs for NEET-PG, FMGE, INI-CET",
  "Instant explanations",
  "Track progress and revise what you got wrong",
];

export const AUTH_ASIDES = {
  login: {
    eyebrow: "Secure access",
    title: "Welcome back. Pick up where you left off.",
    description: "Your practice, progress and revision queue — right where you left them.",
    benefits: PYQ_BENEFITS,
  },
  signup: {
    eyebrow: "Create your account",
    title: "Practise the questions that actually show up.",
    description: "One JSMF account for PYQ practice, explanations and revision.",
    benefits: PYQ_BENEFITS,
  },
  recover: {
    eyebrow: "Account recovery",
    title: "Back to practice in a minute.",
    description: "Reset your password and carry on with your preparation.",
    benefits: PYQ_BENEFITS,
  },
} satisfies Record<string, AuthAside>;

/**
 * The two-column auth stage from main-web/src/components/auth-page.tsx: a
 * marketing column on the left (hidden on mobile) and the account card on
 * the right.
 */
export function AuthCard({
  title,
  description,
  children,
  footer,
  aside = AUTH_ASIDES.login,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  aside?: AuthAside;
}) {
  return (
    <section className="auth-stage">
      <div className="auth-aside">
        <span className="eyebrow">
          <ShieldCheck className="size-3.5" />
          {aside.eyebrow}
        </span>
        <h1 className="font-display text-4xl font-semibold leading-tight text-brand-deep dark:text-foreground md:text-5xl">
          {aside.title}
        </h1>
        <p className="max-w-md text-base leading-relaxed text-muted-foreground">{aside.description}</p>
        <div className="space-y-3 text-sm text-foreground">
          {aside.benefits.map((benefit) => (
            <p key={benefit} className="flex items-center gap-2">
              <CheckCircle2 className="size-4.5 shrink-0 text-success-foreground" />
              {benefit}
            </p>
          ))}
        </div>
      </div>

      <div className="auth-card">
        <div>
          <p className="mb-2 text-xs font-bold uppercase text-primary">JSMF account</p>
          <h2 className="font-display text-2xl font-semibold text-brand-deep dark:text-foreground">{title}</h2>
          {description && <p className="mt-2 text-sm text-muted-foreground">{description}</p>}
        </div>
        <div className="mt-7 space-y-6">{children}</div>
        {footer && <p className="mt-6 text-center text-sm text-muted-foreground">{footer}</p>}
      </div>
    </section>
  );
}

/** Shared field markup — main-web's `field-label` / `field` pair. */
export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <span className="text-xs font-medium text-destructive">{message}</span>;
}
