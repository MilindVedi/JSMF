"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { AuthCard } from "@/components/layout/auth-card";
import { safeNext } from "@/components/auth/google-sign-in";
import { googleAuth } from "@/lib/api/auth";
import { useAuthStore } from "@/store/auth-store";

/**
 * Where Google sign-in lands. The API sends a single-use code, never tokens,
 * and this page trades it over POST — so no credential appears in a URL.
 */
function CallbackHandler() {
  const router = useRouter();
  const params = useSearchParams();
  const adopt = useAuthStore((s) => s.adopt);
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
        router.replace(safeNext(googleAuth.consumeNext()));
      })
      .catch((caught: unknown) =>
        setExchangeError(caught instanceof Error ? caught.message : "Could not complete sign-in.")
      );
  }, [code, linkError, adopt, router]);

  if (error) {
    return (
      <AuthCard title="Sign-in failed" description={error}>
        <Link href="/login" className={buttonVariants({ className: "w-full" })}>
          Back to log in
        </Link>
      </AuthCard>
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
    <div className="flex min-h-dvh items-center justify-center bg-muted/40 px-4">
      <div className="w-full max-w-sm">
        <Suspense fallback={<Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />}>
          <CallbackHandler />
        </Suspense>
      </div>
    </div>
  );
}
