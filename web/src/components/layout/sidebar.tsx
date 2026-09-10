"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { Logo } from "@/components/common/logo";
import { SidebarNav } from "./sidebar-nav";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 md:flex",
        collapsed ? "w-[72px]" : "w-[260px]"
      )}
    >
      <div className={cn("flex h-14 items-center border-b border-sidebar-border px-4", collapsed && "justify-center px-0")}>
        <Link href="/dashboard" className={cn(collapsed && "hidden")}>
          <Logo />
        </Link>
        {collapsed && (
          <span className="flex size-7 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
            J
          </span>
        )}
      </div>

      <SidebarNav collapsed={collapsed} />

      <div className="border-t border-sidebar-border p-2">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex w-full items-center justify-center gap-2 rounded-lg py-2 text-xs font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
          {!collapsed && "Collapse"}
        </button>
      </div>
    </aside>
  );
}
