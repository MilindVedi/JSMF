"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, LogOut, Menu, Settings, User as UserIcon } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Logo } from "@/components/common/logo";
import { SidebarNav } from "./sidebar-nav";
import { TopbarStreakChip } from "./topbar-streak-chip";
import { useAuthStore } from "@/store/auth-store";
import { getPlanById } from "@/data/mock/plans";

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function Topbar() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const logout = useAuthStore((s) => s.logout);
  const plan = getPlanById(profile.currentPlanId);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur supports-backdrop-filter:bg-background/80 sm:px-6">
      <Sheet>
        <SheetTrigger className="-ml-1 flex size-8 items-center justify-center rounded-lg text-foreground hover:bg-muted md:hidden">
          <Menu className="size-5" />
        </SheetTrigger>
        <SheetContent side="left" className="w-[260px] p-0">
          <SheetHeader className="h-14 flex-row items-center justify-start gap-2 border-b border-border p-0 px-4">
            <SheetTitle className="sr-only">Navigation menu</SheetTitle>
            <Logo />
          </SheetHeader>
          <SidebarNav />
        </SheetContent>
      </Sheet>

      <div className="md:hidden">
        <Logo />
      </div>

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        {/* No streak established yet — an empty "0-day streak" pill reads as
            a failed achievement rather than an invitation; the dashboard's
            streak card already carries that invitation instead. */}
        {profile.streakDays > 0 && <TopbarStreakChip streakDays={profile.streakDays} />}
        {plan && (
          <Link
            href="/subscription"
            className="hidden rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-muted sm:inline-flex"
          >
            {plan.name}
          </Link>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            <Avatar className="size-8">
              {profile.avatarUrl && <AvatarImage src={profile.avatarUrl} alt={profile.name} />}
              <AvatarFallback className="text-xs font-semibold">
                {initials(profile.name)}
              </AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="flex flex-col gap-0.5 py-1.5">
                <span className="text-sm font-medium text-foreground">{profile.name}</span>
                <span className="truncate text-xs font-normal text-muted-foreground">
                  {profile.email}
                </span>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href="/profile" />}>
              <UserIcon /> Profile
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/subscription" />}>
              <Settings /> Subscription
            </DropdownMenuItem>
            <DropdownMenuItem render={<a href="/" target="_blank" rel="noreferrer" />}>
              <ExternalLink /> Visit JSMF website
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => {
                logout();
                router.replace("/login");
              }}
            >
              <LogOut /> Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
