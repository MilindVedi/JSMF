"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BookOpen,
  ExternalLink,
  GraduationCap,
  Home,
  Library,
  LogIn,
  LogOut,
  Menu,
  Shield,
  UserPlus,
  X,
} from "lucide-react";
import { LegalGate } from "@/components/legal/legal-gate";
import { storeButton } from "@/components/store/store-button";
import { StoreFooter } from "@/components/store/store-footer";
import { cn } from "@/lib/utils";
import { brand, mainWebsiteUrl, medPrepUrl } from "@/lib/site-content";
import { useMedPrepLink } from "@/lib/use-platform-settings";
import { isAdmin, useSessionStore } from "@/store/session-store";

/**
 * The public storefront shell.
 *
 * Unlike the admin group there is no gate here: browsing and free downloads
 * must work signed-out, and individual pages ask for sign-in only at the point
 * it is actually needed (buying, or opening the library).
 */
export default function StoreLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, ready, restore, logout } = useSessionStore();
  const [menuOpen, setMenuOpen] = useState(false);
  // Both switches live in Admin -> Settings, so the link and its "New" badge
  // can each be turned off without a deploy. Null until they arrive.
  const medPrepLink = useMedPrepLink();

  useEffect(() => {
    void restore();
  }, [restore]);

  const isAccountPage = pathname.startsWith("/account");

  const navLinks = [
    { href: "/", label: "Home", icon: Home, show: true },
    { href: "/browse", label: "Browse", icon: BookOpen, show: true },
    // Only for signed-in buyers. A library is necessarily empty for anyone
    // without an account, so offering it signed-out sends a first-time visitor
    // to a dead end before they have seen a single resource.
    { href: "/library", label: "My Library", icon: Library, show: Boolean(user) },
    // Never rendered for buyers or signed-out visitors — `isAdmin` gates it, so
    // the public storefront never shows a route into the admin panel.
    //
    // It exists for the admin who is already signed in and has landed on a
    // buyer page: the storefront and the admin panel are separate shells with
    // separate navs, so without this there is no way back and it looks as
    // though the admin features have disappeared.
    { href: "/admin/products", label: "Admin", icon: Shield, show: isAdmin(user) },
  ].filter((link) => link.show);

  // Cross-site nav lives in the header, not the footer, because a visitor who
  // came looking for live sessions and landed on the store needs the
  // crossover visible straight away rather than hidden below the fold.
  const mainSiteLink = (
    <a
      href={mainWebsiteUrl}
      target="_blank"
      rel="noreferrer"
      className="nav-link"
      aria-label="Visit the main JSMF website in a new tab"
    >
      <ExternalLink className="size-4" /> Visit our main website
    </a>
  );

  // The practice site, behind its own switch — and, while it is still new,
  // wearing a badge that says so. Rendered in the same two places as the
  // main-site link, so the two crossovers always travel together.
  const medPrepSiteLink = medPrepLink?.enabled ? (
    <a
      href={medPrepUrl}
      target="_blank"
      rel="noreferrer"
      className={cn("nav-link", medPrepLink.highlight && "nav-new")}
      aria-label="Visit JSMF Med Prep, the question practice site, in a new tab"
    >
      <GraduationCap className="size-4" /> Med Prep
      {medPrepLink.highlight && <span className="nav-new-badge">New</span>}
    </a>
  ) : null;

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-5 lg:px-8">
          <div className="flex min-w-0 items-center gap-8">
            <Link
              href="/"
              className="flex min-w-0 items-center gap-2.5 font-display text-base text-brand-ink"
              aria-label={`${brand.productName} — Jab Studies Met Fun, home`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- build-time constant from public/ */}
              <img
                src="/jab-studies-circle-only.png"
                alt="JSMF logo"
                width={36}
                height={36}
                className="size-9 shrink-0 rounded-full object-cover"
              />
              {/* Name first, then what the initials stand for, divided by a
                  drawn rule rather than a typed "|" so it keeps the border
                  colour and sits at text height. */}
              <span className="shrink-0">
                <span className="font-semibold">JSMF</span>
                <span className="hidden font-normal text-muted-foreground sm:inline"> · Resources</span>
              </span>
              <span aria-hidden="true" className="h-4 w-px shrink-0 bg-border" />
              <span className="truncate font-normal text-muted-foreground">Jab Studies Met Fun</span>
            </Link>

            {/* Not `md`: with the Med Prep crossover the row runs over at
                768 and at 1024, so the ☰ menu holds until 1240. A measured
                width — the content decides this, not the device sizes. */}
            <nav className="hidden items-center gap-2 min-[1240px]:flex" aria-label="Main navigation">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn("nav-link", pathname === link.href && "nav-link-active")}
                >
                  <link.icon className="size-4" />
                  {link.label}
                </Link>
              ))}
              {medPrepSiteLink}
              {mainSiteLink}
            </nav>
          </div>

          {/* `ready` gates this so the header does not flash "Sign in" for a
              buyer who is in fact still signed in from a previous visit. */}
          {ready && !isAccountPage && (
            <div className="hidden shrink-0 items-center gap-2 whitespace-nowrap md:flex">
              {user ? (
                <>
                  <span className="text-sm text-muted-foreground">{user.name}</span>
                  <button
                    type="button"
                    className={storeButton({ variant: "ghost", size: "sm" })}
                    onClick={async () => {
                      await logout();
                      router.push("/");
                    }}
                  >
                    <LogOut className="size-4" />
                    <span className="sr-only">Log out</span>
                  </button>
                </>
              ) : (
                // Two entry points to one screen. Both land on the same
                // Google flow, which signs in an existing account and creates
                // one that does not exist — so the labels describe the
                // visitor's intent rather than two different mechanisms, and
                // neither can be the wrong choice.
                //
                // "Create account" is the filled button because a storefront's
                // job is to convert a first-time visitor; a returning buyer
                // will find "Sign in" whether or not it is emphasised.
                <>
                  <Link
                    href="/account/login"
                    className={storeButton({ variant: "ghost", size: "sm" })}
                  >
                    Sign in
                  </Link>
                  <Link href="/account/signup" className={storeButton({ size: "sm" })}>
                    Create account
                  </Link>
                </>
              )}
            </div>
          )}

          <button
            type="button"
            className="grid size-10 place-items-center rounded-full text-foreground min-[1240px]:hidden"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label="Toggle navigation"
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>

        {/* Tapping anything in the sheet closes it: without that it stays
            open over the page just navigated to, which reads as a failed tap. */}
        {menuOpen && (
          <nav
            className="flex flex-col gap-2 border-t border-border bg-background p-4 min-[1240px]:hidden"
            onClick={() => setMenuOpen(false)}
          >
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn("nav-link", pathname === link.href && "nav-link-active")}
              >
                <link.icon className="size-4" />
                {link.label}
              </Link>
            ))}
            {medPrepSiteLink}
            {mainSiteLink}

            {ready && !isAccountPage && (
              <>
                {user ? (
                  <button
                    type="button"
                    className="nav-link"
                    onClick={async () => {
                      await logout();
                      router.push("/");
                    }}
                  >
                    <LogOut className="size-4" />
                    Log out
                  </button>
                ) : (
                  <>
                    <Link href="/account/login" className="nav-link">
                      <LogIn className="size-4" />
                      Sign in
                    </Link>
                    <Link href="/account/signup" className="nav-link">
                      <UserPlus className="size-4" />
                      Create account
                    </Link>
                  </>
                )}
              </>
            )}
          </nav>
        )}
      </header>

      {/* Renders nothing signed out, or while the user is up to date. */}
      <LegalGate />

      <main className="flex-1">{children}</main>

      <StoreFooter />
    </div>
  );
}
