"use client";

import { Loader2 } from "lucide-react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { useRequireAuth } from "@/lib/use-require-auth";
import { SeedDemoData } from "@/components/common/seed-demo-data";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { ready } = useRequireAuth();

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh bg-background">
      <SeedDemoData />
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6 sm:px-6 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
