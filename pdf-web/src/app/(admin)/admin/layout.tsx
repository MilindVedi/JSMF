"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BookOpenCheck,
  CalendarDays,
  FileText,
  FolderTree,
  Loader2,
  LogOut,
  ReceiptText,
  Settings,
  Sparkles,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isAdmin, useSessionStore } from "@/store/session-store";

const NAV = [
  { href: "/admin/products", label: "Products", icon: FileText },
  { href: "/admin/featured", label: "Featured", icon: Sparkles },
  { href: "/admin/sessions", label: "Sessions", icon: CalendarDays },
  { href: "/admin/taxonomy", label: "Categories", icon: FolderTree },
  { href: "/admin/pyq", label: "Question bank", icon: BookOpenCheck },
  { href: "/admin/orders", label: "Orders", icon: ReceiptText },
  { href: "/admin/team", label: "Team", icon: Users },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

/**
 * The admin shell and its client-side role gate.
 *
 * This gate is a UX convenience, never the security boundary: it stops an
 * unauthorised person seeing a broken panel, but every endpoint behind it
 * re-checks the role server-side against a freshly read user record. Removing
 * this component would leak no data.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, ready, restore, logout } = useSessionStore();

  // Routes inside the admin area that a non-admin must be able to reach:
  // signing in, and accepting an invitation — an invitee has no account at all
  // until they finish, so gating that page would make it impossible to use.
  const isUngated =
    pathname === "/admin/login" || pathname === "/admin/accept-invite";

  useEffect(() => {
    void restore();
  }, [restore]);

  useEffect(() => {
    if (!ready || isUngated) return;
    if (!user || !isAdmin(user)) router.replace("/admin/login");
  }, [ready, user, isUngated, router]);

  if (isUngated) return <>{children}</>;

  if (!ready || !user || !isAdmin(user)) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      {/*
        Two-row header. The old single-row version crammed brand + 8 nav items +
        the signed-in email + a logout button into one 56px bar, which forced
        horizontal scrolling on the nav and buried the identity. Splitting
        brand/identity above and the full nav below lets each row take the width
        it needs, and the nav wraps vertically once it runs out of room instead
        of hiding items off the right edge.
      */}
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1280px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/admin/products" className="flex items-center gap-2 font-semibold tracking-tight">
            {/* eslint-disable-next-line @next/next/no-img-element -- build-time constant from public/ */}
            <img src="/favicon.png" alt="" width={28} height={28} className="size-7 rounded-full object-cover" />
            <span className="text-base">
              JSMF <span className="text-muted-foreground">Admin</span>
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">{user.email}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await logout();
                router.replace("/admin/login");
              }}
            >
              <LogOut className="size-4" />
              <span className="sr-only sm:not-sr-only">Log out</span>
            </Button>
          </div>
        </div>

        <nav className="mx-auto w-full max-w-[1280px] px-4 pb-3 sm:px-6">
          <div className="flex flex-wrap items-center gap-1.5">
            {NAV.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
                    active
                      ? "bg-secondary text-secondary-foreground"
                      : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                  )}
                >
                  <item.icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6 sm:px-6 lg:py-8">
        {children}
      </main>
    </div>
  );
}
