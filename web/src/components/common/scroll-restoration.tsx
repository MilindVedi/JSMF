"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Per-route scroll positions, keyed by pathname+search. Module-level (not
 * React state) so it survives across client-side navigations without
 * triggering re-renders, and simply resets on a hard reload — which is fine,
 * since a hard reload is a different action than an in-app back-and-forth.
 */
const positions = new Map<string, number>();

function ScrollRestorationInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const key = `${pathname}?${searchParams.toString()}`;
  const keyRef = useRef(key);
  useEffect(() => {
    keyRef.current = key;
  }, [key]);

  // Next.js only restores scroll for actual browser back/forward (history
  // POP) navigations. Most "return to where I was" actions in this app are
  // regular pushes to a remembered href (e.g. practice's "Save & Exit"), which
  // Next treats as a fresh forward navigation and scrolls to top. Continuously
  // recording scroll position — rather than trying to capture it once when a
  // route unmounts — means the last known value is already saved by the time
  // any navigation away happens.
  useEffect(() => {
    function handleScroll() {
      positions.set(keyRef.current, window.scrollY);
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // On every route change, restore this route's last known scroll position.
  // Retried across a few frames because the page's real height may not be
  // final on first paint yet (async store hydration, charts, etc.) — a single
  // immediate scrollTo would land short on a page that's still growing.
  useEffect(() => {
    // A navigation targeting an in-page anchor (e.g. a Statistics card linking
    // to /revision#collections-section) should let the browser/Next scroll to
    // that element — our own remembered position for the destination route
    // would otherwise fight it and usually win, landing on the wrong spot.
    if (window.location.hash) return;

    const saved = positions.get(key);
    if (saved == null) return;

    let attempts = 0;
    let raf: number;
    const tryRestore = () => {
      window.scrollTo(0, saved);
      attempts += 1;
      if (attempts < 8) raf = requestAnimationFrame(tryRestore);
    };
    raf = requestAnimationFrame(tryRestore);
    return () => cancelAnimationFrame(raf);
  }, [key]);

  return null;
}

export function ScrollRestoration() {
  return <ScrollRestorationInner />;
}
