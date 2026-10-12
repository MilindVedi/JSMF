"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { GoogleButton } from "@/components/ui/google-button";
import { authApi } from "@jsmf/core/api";
import { googleAuth } from "@/lib/google-auth";
import { DATA_SOURCE_KIND } from "@/lib/data-source";

/**
 * "Continue with Google" — rendered only against the real API, and only when
 * the server says Google sign-in is enabled (never a dead button).
 */
export function GoogleSignIn({ next, mode = "login" }: { next?: string; mode?: "login" | "signup" }) {
  const signup = mode === "signup";
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

  // Same block as main-web's auth page: Google leads, with the "RECOMMENDED"
  // treatment on signup only, then the divider into the email form.
  return (
    <div>
      <div className={signup ? "relative rounded-2xl bg-accent px-4 pb-4 pt-6" : ""}>
        {signup && (
          <span className="absolute left-1/2 top-0 inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full bg-primary px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">
            <Sparkles size={11} /> Recommended
          </span>
        )}
        <GoogleButton
          label={signup ? "Sign up with Google" : "Continue with Google"}
          onClick={() => googleAuth.start({ next })}
          className="h-12 w-full text-[15px] shadow-sm"
        />
        <p className="mt-3 text-center text-xs text-muted-foreground">
          One tap — no password. Fastest sign in / sign up.
        </p>
      </div>

      <div className="mt-6 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or continue with email
        <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}

/** A safe in-app redirect target from `?next=`, never an external URL. */
export function safeNext(next: string | null | undefined, fallback = "/dashboard") {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}
