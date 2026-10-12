import Link from "next/link";
import { ContactButton } from "@/components/marketing/contact-button";

const LEGAL_LINKS = [
  { href: "/about", label: "About Us" },
  { href: "/pricing", label: "Pricing" },
  { href: "/contact", label: "Contact" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms & Conditions" },
  { href: "/refund-policy", label: "Refund Policy" },
];

/** The same footer as jsmf.me: contact first, then the legal links, then the fine print. */
export function MarketingFooter() {
  return (
    <footer className="border-t border-border bg-card py-10">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6 px-4 sm:px-6">
        <div className="flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
          <ContactButton />
          <p className="text-sm font-semibold text-brand-deep dark:text-foreground">
            Doctor-led preparation for NEET-PG, FMGE and INI-CET.
          </p>
        </div>
        <nav className="flex flex-wrap gap-x-5 gap-y-2 border-t border-border pt-5 text-xs font-semibold text-muted-foreground">
          {LEGAL_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-primary">
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex flex-col gap-2 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between">
          <p>© {new Date().getFullYear()} JSMF · Dr. Angad Rai</p>
          <p>JSMF is not affiliated with NBEMS, AIIMS, or any exam-conducting body.</p>
        </div>
      </div>
    </footer>
  );
}
