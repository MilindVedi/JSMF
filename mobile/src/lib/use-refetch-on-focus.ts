import { useCallback, useEffect, useRef } from "react";
import { useFocusEffect } from "expo-router";

interface Refetchable {
  isStale: boolean;
  refetch: () => unknown;
}

/**
 * Reloads a screen's data when the screen comes back into view, if a write
 * elsewhere has marked it stale — web's behaviour of showing fresh lists when
 * you navigate back to a page.
 *
 * Needed on the phone because tab screens stay mounted: after a practice
 * session, the Practice tab is shown again rather than mounted again, so a
 * query invalidated with refetchType "none" (core's writes do this, to keep
 * web from refetching lists nobody is looking at) would never reload. The
 * first focus is skipped — the screen's own mount has just fetched.
 */
export function useRefetchOnFocus(...queries: Refetchable[]): void {
  // Read while rendering on purpose: React Query only keeps a result field
  // current (and re-renders on its change) once a render has read it. Read
  // only inside the focus callback, `isStale` could still say false the first
  // time a hidden tab came back after a write elsewhere, and skip the reload.
  for (const query of queries) void query.isStale;
  const first = useRef(true);
  const latest = useRef(queries);
  // The newest results, for the focus callback (which is created once).
  useEffect(() => {
    latest.current = queries;
  });

  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      for (const query of latest.current) if (query.isStale) void query.refetch();
    }, []),
  );
}
