"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { ContactDialog } from "@/components/store/contact-dialog";
import { brand, mainWebsiteUrl } from "@/lib/site-content";

/**
 * The storefront's footer, mirroring jsmf.me's — same Contact Us button, same
 * legal links, same copyright/disclaimer. The legal pages themselves live on
 * jsmf.me (one canonical copy, so the About/Privacy/Terms/Refund text can
 * never drift between the two sites), and are linked as absolute URLs built
 * from `mainWebsiteUrl` so a staging deploy points at a staging main-site.
 */
const LEGAL_LINKS: Array<{ path: string; label: string }> = [
  { path: "/about", label: "About Us" },
  { path: "/privacy", label: "Privacy Policy" },
  { path: "/terms", label: "Terms & Conditions" },
  { path: "/refund-policy", label: "Refund & Cancellation" },
  { path: "/digital-delivery", label: "Digital Delivery" },
  { path: "/disclaimer", label: "Disclaimer" },
];

export function StoreFooter() {
  const [contactOpen, setContactOpen] = useState(false);

  return (
    <footer className="border-t border-border bg-card py-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 lg:px-8">
        <div className="flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
          <button
            type="button"
            onClick={() => setContactOpen(true)}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:border-primary hover:bg-accent"
          >
            <Mail size={15} /> Contact us
          </button>
          <p className="text-sm font-semibold text-brand-deep">{brand.subheadline}</p>
        </div>

        <nav className="flex flex-wrap gap-x-5 gap-y-2 border-t border-border pt-5 text-xs font-semibold text-muted-foreground">
          {LEGAL_LINKS.map((link) => (
            <a
              key={link.path}
              href={`${mainWebsiteUrl}${link.path}`}
              target="_blank"
              rel="noreferrer"
              className="hover:text-primary"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex flex-col gap-2 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between">
          <p>© {new Date().getFullYear()} JSMF · Dr. Angad Rai</p>
          <p>{brand.disclaimer}</p>
        </div>
      </div>

      <ContactDialog open={contactOpen} onClose={() => setContactOpen(false)} />
    </footer>
  );
}
