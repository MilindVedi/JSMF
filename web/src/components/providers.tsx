"use client";

import { useEffect } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
// Configures @jsmf/core (API base URL, token storage, data source) before anything renders.
import "@/lib/core";
import { queryClient } from "@/lib/query-client";
import { useAuthStore } from "@/store/auth-store";
import { LegalGate } from "@/components/legal/legal-gate";

/** Client-side app services: the query cache, session restore and the legal acceptance gate. */
export function Providers({ children }: { children: React.ReactNode }) {
  const restore = useAuthStore((s) => s.restore);
  useEffect(() => {
    void restore();
  }, [restore]);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <LegalGate />
    </QueryClientProvider>
  );
}
