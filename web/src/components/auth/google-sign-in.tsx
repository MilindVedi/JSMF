"use client";

import { useEffect, useState } from "react";
import { FcGoogle } from "react-icons/fc";
import { Button } from "@/components/ui/button";
import { authApi, googleAuth } from "@/lib/api/auth";
import { DATA_SOURCE_KIND } from "@/lib/data-source";

/**
 * "Continue with Google" — rendered only against the real API, and only when
 * the server says Google sign-in is enabled (never a dead button).
 */
export function GoogleSignIn({ next }: { next?: string }) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (DATA_SOURCE_KIND !== "api") return;
    let active = true;
    authApi
      .methods()
      .then((methods) => active && setEnabled(methods.google))
      .catch(() => active && setEnabled(false));
    return () => {
      active = false;
    };
  }, []);

  if (!enabled) return null;

  return (
    <div className="space-y-4">
      <Button type="button" variant="outline" size="lg" className="w-full" onClick={() => googleAuth.start({ next })}>
        <FcGoogle className="size-4" />
        Continue with Google
      </Button>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}

/** A safe in-app redirect target from `?next=`, never an external URL. */
export function safeNext(next: string | null | undefined, fallback = "/dashboard") {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}
