"use client";

import { useEffect } from "react";
import { usePracticeStore } from "@/store/practice-store";
import { useBookmarksStore } from "@/store/bookmarks-store";
import { buildSeedBookmarkIds, buildSeedSessions } from "@/lib/seed-demo-data";

/**
 * Mounted once inside the authenticated app shell. Populates the practice
 * and bookmarks stores with plausible demo history on first run only — both
 * stores no-op if they already hold data (including real data from a prior
 * localStorage-persisted visit), so this never overwrites genuine activity.
 */
export function SeedDemoData() {
  const seedSessions = usePracticeStore((s) => s.seedSessions);
  const seedBookmarks = useBookmarksStore((s) => s.seedBookmarks);
  const hasHydratedPractice = usePracticeStore((s) => s.hasHydrated);
  const hasHydratedBookmarks = useBookmarksStore((s) => s.hasHydrated);

  useEffect(() => {
    if (!hasHydratedPractice || !hasHydratedBookmarks) return;
    seedSessions(buildSeedSessions());
    seedBookmarks(buildSeedBookmarkIds());
    // Only run once hydration completes; the store guards prevent re-seeding.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasHydratedPractice, hasHydratedBookmarks]);

  return null;
}
