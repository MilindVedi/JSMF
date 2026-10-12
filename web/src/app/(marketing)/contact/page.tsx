import { Mail, MapPin, MessageCircle } from "lucide-react";
import { ContactButton } from "@/components/marketing/contact-button";
import { businessAddress, supportEmail } from "@/lib/site-content";

export default function ContactPage() {
  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 py-20 sm:px-6 sm:py-28">
      <div className="mx-auto max-w-2xl text-center">
        <span className="eyebrow">Contact</span>
        <h1 className="mt-5 font-display text-4xl font-semibold leading-tight text-brand-deep dark:text-foreground sm:text-5xl">
          Get in touch
        </h1>
        <p className="mt-4 text-muted-foreground">
          Questions about a Jab Studies Met Fun (JSMF) subscription, a question you think is wrong, or
          anything else — we&apos;d like to hear from you.
        </p>
        <div className="mt-6 flex justify-center">
          <ContactButton />
        </div>
      </div>

      <div className="mx-auto mt-14 grid max-w-3xl gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Mail className="size-5" strokeWidth={1.75} />
          </div>
          <p className="mt-4 font-display text-sm font-semibold text-brand-deep dark:text-foreground">Email</p>
          <a href={`mailto:${supportEmail}`} className="mt-1 block text-sm text-muted-foreground hover:text-primary">
            {supportEmail}
          </a>
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <MessageCircle className="size-5" strokeWidth={1.75} />
          </div>
          <p className="mt-4 font-display text-sm font-semibold text-brand-deep dark:text-foreground">Response time</p>
          <p className="mt-1 text-sm text-muted-foreground">Usually within 1–2 business days.</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <MapPin className="size-5" strokeWidth={1.75} />
          </div>
          <p className="mt-4 font-display text-sm font-semibold text-brand-deep dark:text-foreground">Address</p>
          <a
            href={businessAddress.mapsUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-1 block text-sm text-muted-foreground hover:text-primary"
          >
            {businessAddress.lines.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </a>
        </div>
      </div>
    </div>
  );
}
