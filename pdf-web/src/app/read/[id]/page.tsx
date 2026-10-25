"use client";

import { Suspense, use, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { LegalGate } from "@/components/legal/legal-gate";
import { Reader } from "@/components/reader/reader";
import { productSource, sampleSource } from "@/lib/reader/sources";
import { useSessionStore } from "@/store/session-store";

/**
 * /read/{productId} — the product in the reader. /read/{productId}?sample=1 —
 * its sample. `back` says where the back arrow goes (a path on this site);
 * without it, the library for a book and the product page for a sample.
 *
 * Outside the store layout on purpose: reading takes the whole screen.
 */
export default function ReadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={<Opening />}>
      <ReadPageInner productId={id} />
    </Suspense>
  );
}

function ReadPageInner({ productId }: { productId: string }) {
  const searchParams = useSearchParams();
  const { user, ready, restore } = useSessionStore();
  const isSample = searchParams.get("sample") === "1";

  useEffect(() => {
    void restore();
  }, [restore]);

  const source = useMemo(
    () => (isSample ? sampleSource(productId) : productSource(productId)),
    [isSample, productId],
  );

  const backHref = sitePath(searchParams.get("back"));
  const query = new URLSearchParams({
    ...(isSample ? { sample: "1" } : {}),
    ...(backHref ? { back: backHref } : {}),
  }).toString();
  const here = `/read/${productId}${query ? `?${query}` : ""}`;
  const loginHref = `/account/login?next=${encodeURIComponent(here)}`;

  // Wait for the session, so a signed-in owner is never shown "sign in to read".
  if (!ready) return <Opening />;

  return (
    <>
      <LegalGate />
      <Reader source={source} signedIn={Boolean(user)} requestedBack={backHref} loginHref={loginHref} />
    </>
  );
}

/**
 * `back` as a path on this site, or null. Never somewhere a crafted link
 * chose: `/\evil.com` and the like start with "/" but browsers read them as
 * another site, so the path is resolved the way a browser would and must
 * stay on this origin.
 */
function sitePath(requested: string | null): string | null {
  if (!requested || !requested.startsWith("/") || /[\\\s]/.test(requested)) return null;
  try {
    const base = "https://site.invalid";
    const resolved = new URL(requested, base);
    return resolved.origin === base ? `${resolved.pathname}${resolved.search}${resolved.hash}` : null;
  } catch {
    return null;
  }
}

function Opening() {
  return (
    <div className="fixed inset-0 flex items-center justify-center">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  );
}
