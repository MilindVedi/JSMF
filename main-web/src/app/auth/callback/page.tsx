"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { googleAuth } from "@/lib/api/auth";
import { useSessionStore } from "@/store/session-store";

/**
 * Where Google sign-in lands. The API sends a single-use code, never tokens,
 * and this page trades it over POST — so no credential appears in a URL.
 */
function CallbackHandler() {
  const router = useRouter();
  const params = useSearchParams();
  const adopt = useSessionStore((state) => state.adopt);
  const [exchangeError, setExchangeError] = useState<string | null>(null);
  // Single-use code; React Strict Mode would otherwise exchange it twice.
  const exchanged = useRef(false);

  const code = params.get("code");
  const linkError = params.get("error") ?? (code ? null : "This sign-in link is missing its code.");
  const error = linkError ?? exchangeError;

  useEffect(() => {
    if (!code || linkError || exchanged.current) return;
    exchanged.current = true;

    googleAuth
      .exchange(code)
      .then((session) => {
        adopt(session);
        router.replace(googleAuth.consumeNext() ?? "/");
      })
      .catch((caught: unknown) =>
        setExchangeError(caught instanceof Error ? caught.message : "Could not complete sign-in."),
      );
  }, [code, linkError, adopt, router]);

  if (error) {
    return (
      <div className="auth-card text-center">
        <h1 className="font-display text-xl font-semibold text-brand-deep">Sign-in failed</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        <Link href="/account/login" className={buttonVariants({ className: "mt-6 w-full" })}>
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Finishing sign-in…</p>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <Suspense fallback={<Loader2 className="size-6 animate-spin text-muted-foreground" />}>
        <CallbackHandler />
      </Suspense>
    </div>
  );
}
