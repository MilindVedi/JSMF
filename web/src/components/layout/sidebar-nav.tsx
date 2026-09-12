"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  ClipboardList,
  CreditCard,
  History,
  LayoutDashboard,
  Map,
  Repeat,
  User,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/**
 * Ordered to match the product loop: practise → identify weaknesses → revise.
 * Revision sits above History/Statistics because revising is the promise, not
 * a reporting afterthought; it absorbs the old Bookmarks and Wrong Questions
 * entries, both of which are still reachable from inside it.
 */
const PRIMARY_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/question-bank", label: "Question Bank", icon: ClipboardList },
  { href: "/custom-test/new", label: "Custom Test", icon: BarChart3 },
  { href: "/revision", label: "Revision", icon: Repeat },
  { href: "/history", label: "History", icon: History },
  { href: "/statistics", label: "Statistics", icon: BarChart3 },
];

const SECONDARY_NAV: NavItem[] = [
  { href: "/roadmap", label: "Roadmap & Phases", icon: Map },
  { href: "/subscription", label: "Subscription", icon: CreditCard },
  { href: "/profile", label: "Profile", icon: User },
];

function NavLink({ item, collapsed, onNavigate }: { item: NavItem; collapsed?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = pathname === item.href || pathname?.startsWith(item.href + "/");
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        collapsed && "justify-center px-0",
        active
          ? "bg-teal text-teal-foreground"
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      )}
    >
      <Icon className="size-4.5 shrink-0" strokeWidth={1.9} />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
}

export function SidebarNav({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-2 py-4">
      <div className="flex flex-col gap-0.5">
        {PRIMARY_NAV.map((item) => (
          <NavLink key={item.href} item={item} collapsed={collapsed} onNavigate={onNavigate} />
        ))}
      </div>
      <div className="flex flex-col gap-0.5 border-t border-sidebar-border pt-4">
        {SECONDARY_NAV.map((item) => (
          <NavLink key={item.href} item={item} collapsed={collapsed} onNavigate={onNavigate} />
        ))}
      </div>
    </nav>
  );
}
