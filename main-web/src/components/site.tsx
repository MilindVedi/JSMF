"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { BookOpen, Home, LogIn, LogOut, Mail, Menu, Users, Video, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { ContactDialog } from "@/components/contact-dialog";
import { currentOffering } from "@/lib/api/mentorship";
import { useSessionStore } from "@/store/session-store";

/**
 * The mark, the initials, and what they stand for, on one line: "JSMF" carries
 * the weight and "Jab Studies Met Fun" follows at the same size in muted type,
 * so the full form reads as the name rather than as a caption. Dropped below
 * `sm`, where the initials alone carry it and the row is tight.
 *
 * The same lockup is in web/src/components/common/logo.tsx and pdf-web's
 * store layout; those add the product name ("Med Prep", "Resources").
 */
function Brand() {
  return (
    <Link
      href="/"
      className="flex shrink-0 items-center gap-2.5 font-display text-base text-brand-deep"
      aria-label="JSMF — Jab Studies Met Fun, home"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/favicon.png" alt="" width={44} height={44} className="size-11 shrink-0 object-contain" />
      <span className="font-semibold">JSMF</span>
      {/* A drawn rule rather than a typed "|": it keeps the border colour and
          sits at text height whatever the font does. */}
      <span aria-hidden="true" className="hidden h-4 w-px shrink-0 bg-border sm:block" />
      <span className="hidden font-normal text-muted-foreground sm:inline">Jab Studies Met Fun</span>
    </Link>
  );
}

/**
 * The sections a visitor actually wants: the live session, who is teaching, and
 * the study resources (which live on the store, so that one leaves the site and
 * says so). Anchors rather than routes — the home page is the whole site.
 */
const NAV_LINKS = [
  { href: "/#session", label: "Live Session", icon: Users, section: "session" },
  { href: "/#about", label: "About", icon: BookOpen, section: "about" },
];

/**
 * Which home-page section the visitor is looking at, so its header link stays
 * highlighted: "session" or "about" while that section crosses the middle of
 * the screen, otherwise "home". Null away from the home page.
 */
function useActiveSection(enabled: boolean) {
  const [active, setActive] = useState("home");

  useEffect(() => {
    if (!enabled) return;
    const inView = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) inView.add(entry.target.id);
          else inView.delete(entry.target.id);
        }
        // The later section wins when two touch the band at once.
        const current = [...NAV_LINKS].reverse().find((link) => inView.has(link.section));
        setActive(current?.section ?? "home");
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    for (const link of NAV_LINKS) {
      const el = document.getElementById(link.section);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [enabled]);

  return enabled ? active : null;
}

function SiteHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const atHome = pathname === "/";
  const { user, ready, restore, logout } = useSessionStore();
  // "Book 1:1" appears only once a one-to-one offering is published, so the
  // header is unchanged until an admin switches the feature on.
  const [mentorship, setMentorship] = useState(false);
  const onMentorship = pathname.startsWith("/mentorship");
  // The link for where the visitor is stays highlighted: the page, or on the
  // home page the section in view.
  const section = useActiveSection(atHome);
  const navClass = (active: boolean) => (active ? "nav-link nav-link-active" : "nav-link");

  useEffect(() => {
    void restore();
  }, [restore]);

  useEffect(() => {
    void currentOffering().then((offering) => setMentorship(Boolean(offering)));
  }, []);

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
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-5 lg:px-8">
        <div className="flex items-center gap-8">
          <Brand />
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Main navigation">
            <Link href="/" className={navClass(section === "home")}>
              <Home size={16} /> Home
            </Link>
            {NAV_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className={navClass(section === link.section)}>
                <link.icon size={16} /> {link.label}
              </Link>
            ))}
            <Link href="/prep-kit" className={navClass(pathname === "/prep-kit")}>
              <BookOpen size={16} /> Reserve a Seat
            </Link>
            {mentorship && (
              <Link href="/mentorship" className={navClass(onMentorship)}>
                <Video size={16} /> Book 1:1
              </Link>
            )}
          </nav>
        </div>
        <div className="hidden items-center gap-2 md:flex">{account}</div>
        <button
          className="grid size-10 place-items-center rounded-full text-foreground lg:hidden"
          onClick={() => setOpen(!open)}
          aria-label="Toggle navigation"
          aria-expanded={open}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
      {/* Tapping anything closes the sheet: left open it covers the section
          just navigated to, which reads as a failed tap. */}
      {open && (
        <nav
          className="flex flex-col gap-2 border-t border-border bg-background p-4 lg:hidden"
          onClick={() => setOpen(false)}
        >
          <Link href="/" className={navClass(section === "home")}>
            <Home size={16} /> Home
          </Link>
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className={navClass(section === link.section)}>
              <link.icon size={16} /> {link.label}
            </Link>
          ))}
          <Link href="/prep-kit" className={navClass(pathname === "/prep-kit")}>
            <BookOpen size={16} /> Reserve a Seat
          </Link>
          {mentorship && (
            <Link href="/mentorship" className={navClass(onMentorship)}>
              <Video size={16} /> Book 1:1
            </Link>
          )}
          <div className="mt-1 flex flex-col gap-2 border-t border-border pt-3 md:hidden">
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
          </div>
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
