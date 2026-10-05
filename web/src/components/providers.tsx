"use client";

import { useEffect } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";
import { useAuthStore } from "@/store/auth-store";

/** Client-side app services: the query cache and session restore. */
export function Providers({ children }: { children: React.ReactNode }) {
  const restore = useAuthStore((s) => s.restore);
  useEffect(() => {
    void restore();
  }, [restore]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
