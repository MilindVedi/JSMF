"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CircleHelp,
  ExternalLink,
  GraduationCap,
  LayoutDashboard,
  ListChecks,
  LogIn,
  Menu,
  Sparkles,
  Tag,
  X,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { mainWebsiteUrl } from "@/lib/site-content";
import { cn } from "@/lib/utils";
import { storeButton } from "@/components/ui/store-button";
import { useAuthStore } from "@/store/auth-store";

const NAV_LINKS = [
  { href: "/#exams", label: "Exams", icon: GraduationCap },
  { href: "/#how-it-works", label: "How it works", icon: ListChecks },
  { href: "/#features", label: "Features", icon: Sparkles },
  { href: "/#faq", label: "FAQ", icon: CircleHelp },
  { href: "/pricing", label: "Pricing", icon: Tag },
];

/** The cross-site link, as in the store's header: jsmf.me in a new tab. */
function MainSiteLink({ onClick }: { onClick?: () => void }) {
  return (
    <a
      href={mainWebsiteUrl}
      target="_blank"
      rel="noreferrer"
      onClick={onClick}
      className="nav-link"
      aria-label="Visit the main JSMF website in a new tab"
    >
      <ExternalLink className="size-4" /> Visit our main website
    </a>
  );
}

/**
 * The store's header (pdf-web src/app/(store)/layout.tsx): "JSMF" + the
 * product name in muted type, icon links beside the logo, the jsmf.me
 * crossover, and account actions on the right.
 */
export function MarketingHeader() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-5 lg:px-8">
        <div className="flex items-center gap-8">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2 font-display text-base font-semibold text-brand-deep dark:text-foreground"
            aria-label="JSMF Med Prep home"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- build-time constant from public/ */}
            <img src="/favicon.png" alt="JSMF logo" width={32} height={32} className="size-8 shrink-0 object-contain" />
            JSMF
            <span className="hidden font-normal text-muted-foreground sm:inline">Med Prep</span>
          </Link>

          <nav className="hidden items-center gap-2 xl:flex" aria-label="Main navigation">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn("nav-link", pathname === link.href && "nav-link-active")}
              >
                <link.icon className="size-4" />
                {link.label}
              </Link>
            ))}
            <MainSiteLink />
          </nav>
        </div>

        <div className="hidden items-center gap-2 md:flex">
          {isAuthenticated ? (
            <Link href="/dashboard" className={storeButton({ size: "sm" })}>
              Go to Dashboard
            </Link>
          ) : (
            <>
              <Link href="/login" className={storeButton({ variant: "ghost", size: "sm" })}>
                Sign in
              </Link>
              <Link href="/signup" className={storeButton({ size: "sm" })}>
                Create account
              </Link>
            </>
          )}
        </div>

        <button
          className="grid size-10 place-items-center rounded-full text-foreground xl:hidden"
          onClick={() => setOpen(!open)}
          aria-label="Toggle navigation"
          aria-expanded={open}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {open && (
        <nav className="flex flex-col gap-2 border-t border-border bg-background p-4 xl:hidden">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} onClick={close} className="nav-link">
              <link.icon className="size-4" />
              {link.label}
            </Link>
          ))}
          <MainSiteLink onClick={close} />
          <div className="mt-1 flex flex-col gap-2 border-t border-border pt-3 md:hidden">
            {isAuthenticated ? (
              <Link href="/dashboard" onClick={close} className={storeButton({ size: "sm" })}>
                <LayoutDashboard size={14} /> Go to Dashboard
              </Link>
            ) : (
              <>
                <Link href="/login" onClick={close} className="nav-link">
                  <LogIn size={16} /> Sign in
                </Link>
                <Link href="/signup" onClick={close} className={storeButton({ size: "sm" })}>
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
