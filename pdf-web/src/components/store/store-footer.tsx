"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail } from "lucide-react";
import { ContactDialog } from "@/components/store/contact-dialog";
import { brand, mainWebsiteUrl } from "@/lib/site-content";

/**
 * The storefront's footer, mirroring jsmf.me's — same Contact Us button, same
 * legal links, same copyright/disclaimer.
 *
 * Privacy, Terms and Refund are this store's own pages: they are versioned
 * documents served by the backend with the sections that apply to the store,
 * so there is still one canonical text — just not one URL. The rest live on
 * jsmf.me and are linked as absolute URLs built from `mainWebsiteUrl`, so a
 * staging deploy points at a staging main-site.
 */
const LEGAL_LINKS: Array<{ path: string; label: string; local?: boolean }> = [
  { path: "/about", label: "About Us" },
  { path: "/privacy", label: "Privacy Policy", local: true },
  { path: "/terms", label: "Terms & Conditions", local: true },
  { path: "/refund-policy", label: "Refund & Cancellation", local: true },
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
          {LEGAL_LINKS.map((link) =>
            link.local ? (
              <Link key={link.path} href={link.path} className="hover:text-primary">
                {link.label}
              </Link>
            ) : (
              <a
                key={link.path}
                href={`${mainWebsiteUrl}${link.path}`}
                target="_blank"
                rel="noreferrer"
                className="hover:text-primary"
              >
                {link.label}
              </a>
            ),
          )}
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
