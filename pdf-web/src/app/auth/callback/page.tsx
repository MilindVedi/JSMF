"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { googleAuth } from "@/lib/api/auth";
import { isAdmin, useSessionStore } from "@/store/session-store";

/**
 * Where Google sign-in lands.
 *
 * The API redirects here with a single-use code rather than tokens, and this
 * page trades it for the real session over POST — so nothing sensitive ever
 * appears in a URL, browser history, or a `Referer` header.
 */
function CallbackHandler() {
  const router = useRouter();
  const params = useSearchParams();
  const adopt = useSessionStore((state) => state.adopt);

  const [error, setError] = useState<string | null>(null);

  // The handoff code is single-use, so exchanging it twice fails. React Strict
  // Mode double-invokes effects in development, which would do exactly that —
  // the same class of bug that once broke session restore here.
  const exchanged = useRef(false);

  useEffect(() => {
    const failure = params.get("error");
    if (failure) {
      setError(failure);
      return;
    }

    const code = params.get("code");
    if (!code) {
      setError("This sign-in link is missing its code.");
      return;
    }

    if (exchanged.current) return;
    exchanged.current = true;

    googleAuth
      .exchange(code)
      .then((session) => {
        const user = adopt(session);
        // Set by the login/signup page right before it sent the browser to
        // Google, e.g. "Sign in to buy" on a product page — otherwise this is
        // a plain sign-in with nowhere in particular to go back to.
        const next = googleAuth.consumeNext();
        router.replace(next ?? (isAdmin(user) ? "/admin/products" : "/library"));
      })
      .catch((caught: unknown) =>
        setError(caught instanceof Error ? caught.message : "Could not complete sign-in."),
      );
  }, [params, adopt, router]);

  if (error) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign-in failed</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="w-full" onClick={() => router.replace("/account/login")}>
            Back to sign in
          </Button>
        </CardContent>
      </Card>
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
