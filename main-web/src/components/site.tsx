"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { LogIn, LogOut, Mail, Menu, X } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { ContactDialog } from "@/components/contact-dialog";
import { useSessionStore } from "@/store/session-store";

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5 font-display text-base font-semibold text-brand-deep" aria-label="JSMF home">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/favicon.png" alt="" width={40} height={40} className="size-10 shrink-0 object-contain" />
      <span>JSMF</span>
    </Link>
  );
}

/**
 * Only Home exists on the main website for now; study resources live on the
 * store, and are reached from the "What's coming" section rather than a nav
 * item pointing off-site.
 */
function SiteHeader() {
  const [open, setOpen] = useState(false);
  const { user, ready, restore, logout } = useSessionStore();

  useEffect(() => {
    void restore();
  }, [restore]);

  const account = !ready ? null : user ? (
    <>
      <span className="hidden text-sm font-semibold text-muted-foreground lg:inline">{user.name}</span>
      <button onClick={() => void logout()} className={buttonVariants({ variant: "ghost", size: "sm" })}>
        <LogOut size={14} /> Sign out
      </button>
    </>
  ) : (
    <>
      <Link href="/account/login" className={buttonVariants({ variant: "ghost", size: "sm" })}>
        Sign in
      </Link>
      <Link href="/account/signup" className={buttonVariants({ size: "sm" })}>
        Create account
      </Link>
    </>
  );

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 lg:px-8">
        <Brand />
        <div className="hidden items-center gap-2 md:flex">{account}</div>
        <button
          className="grid size-10 place-items-center rounded-full text-foreground md:hidden"
          onClick={() => setOpen(!open)}
          aria-label="Toggle navigation"
          aria-expanded={open}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
      {open && (
        <nav className="flex flex-col gap-2 border-t border-border bg-background p-4 md:hidden">
          {ready && user ? (
            <button onClick={() => void logout()} className="nav-link">
              <LogOut size={16} /> Sign out ({user.name})
            </button>
          ) : (
            <>
              <Link href="/account/login" className="nav-link">
                <LogIn size={16} /> Sign in
              </Link>
              <Link href="/account/signup" className={buttonVariants({ size: "sm" })}>
                Create account
              </Link>
            </>
          )}
        </nav>
      )}
    </header>
  );
}

export function SocialLinks() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={buttonVariants({ variant: "secondary", size: "sm" })}
      >
        <Mail size={15} /> Contact us
      </button>
      <ContactDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}

const LEGAL_LINKS = [
  { href: "/about", label: "About Us" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms & Conditions" },
  { href: "/refund-policy", label: "Refund & Cancellation" },
  { href: "/digital-delivery", label: "Digital Delivery" },
  { href: "/disclaimer", label: "Disclaimer" },
];

function SiteFooter() {
  return (
    <footer className="border-t border-border bg-card py-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 lg:px-8">
        <div className="flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
          <SocialLinks />
          <p className="text-sm font-semibold text-brand-deep">
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

export function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
