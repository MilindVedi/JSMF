"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FileText, FolderTree, Loader2, LogOut, ReceiptText, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isAdmin, useSessionStore } from "@/store/session-store";

const NAV = [
  { href: "/admin/products", label: "Products", icon: FileText },
  { href: "/admin/taxonomy", label: "Categories", icon: FolderTree },
  { href: "/admin/orders", label: "Orders", icon: ReceiptText },
  { href: "/admin/team", label: "Team", icon: Users },
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
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-[1280px] items-center gap-4 px-4 sm:px-6">
          <Link href="/admin/products" className="font-semibold tracking-tight">
            JSMF <span className="text-muted-foreground">Admin</span>
          </Link>

          <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
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
          </nav>

          <div className="flex items-center gap-2">
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
      </header>

      <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6 sm:px-6 lg:py-8">
        {children}
      </main>
    </div>
  );
}
