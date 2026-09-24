"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, Library, LogIn, LogOut, Menu, Shield, Stethoscope, X } from "lucide-react";
import { storeButton } from "@/components/store/store-button";
import { cn } from "@/lib/utils";
import { brand } from "@/lib/site-content";
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

  useEffect(() => {
    void restore();
  }, [restore]);

  const isAccountPage = pathname.startsWith("/account");

  const navLinks = [
    { href: "/browse", label: "Browse", icon: BookOpen, show: true },
    // Only for signed-in buyers. A library is necessarily empty for anyone
    // without an account, so offering it signed-out sends a first-time visitor
    // to a dead end before they have seen a single resource.
    { href: "/library", label: "My Library", icon: Library, show: Boolean(user) },
    // The storefront and the admin panel are separate shells with separate
    // navs, so without this an admin who lands on a buyer page has no way back
    // and it looks as though the admin features have disappeared.
    { href: "/admin/products", label: "Admin", icon: Shield, show: isAdmin(user) },
  ].filter((link) => link.show);

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-5 lg:px-8">
          <div className="flex items-center gap-8">
            <Link
              href="/"
              className="flex shrink-0 items-center gap-2 font-display text-base font-semibold text-brand-ink"
              aria-label={`${brand.productName} home`}
            >
              <span className="grid size-8 place-items-center rounded-full bg-primary text-primary-foreground">
                <Stethoscope className="size-4" />
              </span>
              JSMF
              <span className="hidden font-normal text-muted-foreground sm:inline">Resources</span>
            </Link>

            <nav className="hidden items-center gap-2 md:flex" aria-label="Main navigation">
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
            </nav>
          </div>

          {/* `ready` gates this so the header does not flash "Sign in" for a
              buyer who is in fact still signed in from a previous visit. */}
          {ready && !isAccountPage && (
            <div className="hidden items-center gap-2 md:flex">
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
            className="grid size-10 place-items-center rounded-full text-foreground md:hidden"
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
            className="flex flex-col gap-2 border-t border-border bg-background p-4 md:hidden"
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
                    <Link href="/account/signup" className={storeButton({ size: "sm" })}>
                      Create account
                    </Link>
                  </>
                )}
              </>
            )}
          </nav>
        )}
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-border bg-card py-8">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-5 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between lg:px-8">
          <p>{brand.subheadline}</p>
          <p>{brand.disclaimer}</p>
        </div>
      </footer>
    </div>
  );
}
