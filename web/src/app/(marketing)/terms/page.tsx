const SECTIONS = [
  {
    title: "Using JSMF",
    body: "JSMF is a memory-based PYQ preparation platform for NEET-PG, FMGE, and INI-CET. By creating an account, you agree to use the platform only for personal exam preparation and not to redistribute question content.",
  },
  {
    title: "Subscriptions",
    body: "Paid plans unlock additional exam coverage and features as described on the Pricing page. Plans renew automatically unless cancelled before the renewal date.",
  },
  {
    title: "Content accuracy",
    body: "Questions and explanations are curated to reflect commonly tested concepts, but JSMF makes no guarantee that any specific question will appear on an actual exam. JSMF is not affiliated with NBEMS, AIIMS, or any exam-conducting body.",
  },
  {
    title: "Changes to these terms",
    body: "We may update these terms from time to time. Continued use of JSMF after a change means you accept the updated terms.",
  },
  {
    title: "Contact",
    body: "Questions about these terms can be sent to hello@jsmf.in.",
  },
];

export default function TermsOfServicePage() {
  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 py-20 sm:px-6 sm:py-28">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="font-heading text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          Terms of Service
        </h1>
        <p className="mt-4 text-muted-foreground">Last updated January 2026.</p>
      </div>

      <div className="prose-reading mx-auto mt-14 max-w-2xl space-y-8 text-foreground">
        {SECTIONS.map((section) => (
          <div key={section.title}>
            <h2 className="font-heading text-lg font-semibold text-foreground">{section.title}</h2>
            <p className="mt-2">{section.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
