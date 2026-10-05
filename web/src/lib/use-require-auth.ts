"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth-store";

/**
 * Client-side auth gate. Waits until the auth store knows the answer
 * (persisted mock state rehydrated, or the API session restored), then sends
 * signed-out visitors to /login, remembering where they were headed.
 */
export function useRequireAuth() {
  const router = useRouter();
  const pathname = usePathname();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);

  useEffect(() => {
    if (hasHydrated && !isAuthenticated) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [hasHydrated, isAuthenticated, router, pathname]);

  return { isAuthenticated, ready: hasHydrated && isAuthenticated };
}
