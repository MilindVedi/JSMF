import { Mail, MessageCircle } from "lucide-react";

export default function ContactPage() {
  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 py-20 sm:px-6 sm:py-28">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="font-heading text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          Get in touch
        </h1>
        <p className="mt-4 text-muted-foreground">
          Questions about a subscription, a question you think is wrong, or anything else —
          we&apos;d like to hear from you.
        </p>
      </div>

      <div className="mx-auto mt-14 grid max-w-2xl gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Mail className="size-5" strokeWidth={1.75} />
          </div>
          <p className="mt-4 font-heading text-sm font-semibold text-foreground">Email</p>
          <p className="mt-1 text-sm text-muted-foreground">hello@jsmf.in</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <MessageCircle className="size-5" strokeWidth={1.75} />
          </div>
          <p className="mt-4 font-heading text-sm font-semibold text-foreground">Response time</p>
          <p className="mt-1 text-sm text-muted-foreground">Usually within 1–2 business days.</p>
        </div>
      </div>
    </div>
  );
}
