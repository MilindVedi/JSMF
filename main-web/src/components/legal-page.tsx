import { SiteLayout } from "@/components/site";

/** Shared chrome for the policy pages Razorpay (and every visitor) needs to find in the footer. */
export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <SiteLayout>
      <div className="mx-auto max-w-3xl px-5 py-16 lg:px-8">
        <h1 className="font-display text-3xl font-semibold text-brand-deep">{title}</h1>
        <div className="prose-legal mt-8 space-y-6 text-sm leading-relaxed text-foreground">{children}</div>
      </div>
    </SiteLayout>
  );
}

export function LegalSection({ heading, children }: { heading?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      {heading && <h2 className="font-display text-lg font-semibold text-brand-deep">{heading}</h2>}
      {children}
    </section>
  );
}
