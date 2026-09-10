"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth-store";

/**
 * Client-side auth gate for the mock prototype. In the real product this
 * becomes server-side session validation; here it just redirects to /login
 * once the persisted auth store has rehydrated and the user isn't "logged
 * in". See docs/05-ui-ux-plan.md, "Assumptions & Open Questions".
 */
export function useRequireAuth() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);

  useEffect(() => {
    if (hasHydrated && !isAuthenticated) {
      router.replace("/login");
    }
  }, [hasHydrated, isAuthenticated, router]);

  return { isAuthenticated, ready: hasHydrated && isAuthenticated };
}
