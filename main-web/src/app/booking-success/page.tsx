import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Send } from "lucide-react";
import { InstagramIcon, YouTubeIcon } from "@/components/social-icons";
import { SiteLayout } from "@/components/site";
import { buttonVariants } from "@/components/ui/button";
import { EXTERNAL_CHECKOUT_NOTICE } from "@/lib/external-checkout";
import { links, supportEmail } from "@/lib/site-content";

export const metadata: Metadata = {
  title: "Seat reserved | JSMF",
  // Nothing here is worth indexing, and it must never appear in a search result
  // as though it were the way to book.
  robots: { index: false, follow: false },
};

/**
 * Where Razorpay returns people after a successful payment.
 *
 * Deliberately grants nothing and records nothing: anyone can open this URL,
 * so it is a thank-you message only. The payment itself is confirmed by
 * Razorpay, and the seat is fulfilled from the Razorpay dashboard export.
 */
export default function BookingSuccessPage() {
  return (
    <SiteLayout>
      <section className="mx-auto max-w-xl px-5 py-20 text-center lg:px-8">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-success/10 text-success">
          <CheckCircle2 size={28} />
        </span>
        <h1 className="mt-6 font-display text-3xl font-semibold text-brand-deep">Payment successful</h1>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">{EXTERNAL_CHECKOUT_NOTICE}</p>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          Keep an eye on the inbox you paid with — including spam the first time. Anything missing? Email{" "}
          <a href={`mailto:${supportEmail}`} className="font-semibold text-primary">
            {supportEmail}
          </a>
          .
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <a href={links.instagram} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "secondary", size: "lg" })}>
            <InstagramIcon size={16} /> Instagram
          </a>
          <a href={links.telegram} target="_blank" rel="noreferrer" className={buttonVariants({ size: "lg" })}>
            <Send size={16} /> Join Telegram
          </a>
          <a href={links.youtube} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "secondary", size: "lg" })}>
            <YouTubeIcon size={16} /> YouTube
          </a>
          <Link href="/" className={buttonVariants({ variant: "ghost", size: "lg" })}>
            Back to home
          </Link>
        </div>
      </section>
    </SiteLayout>
  );
}
