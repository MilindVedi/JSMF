const SECTIONS = [
  {
    title: "Information we collect",
    body: "When you create an account, we collect your name, email address, and target exam. As you use JSMF, we record your practice sessions, attempts, bookmarks, and collections so your progress can be tracked and shown back to you.",
  },
  {
    title: "How we use it",
    body: "Your data is used to run the product itself — showing your statistics, revision lists, and history — and to improve the question bank and features over time. We do not sell your personal data to third parties.",
  },
  {
    title: "Data retention",
    body: "We retain your account and practice data for as long as your account is active. You can request deletion of your account and associated data at any time by contacting us.",
  },
  {
    title: "Contact",
    body: "Questions about this policy can be sent to hello@jsmf.in.",
  },
];

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 py-20 sm:px-6 sm:py-28">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="font-heading text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          Privacy Policy
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
