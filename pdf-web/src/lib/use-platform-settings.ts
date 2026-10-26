import { useEffect, useState } from "react";
import {
  settingsApi,
  type MentorCardStyle,
  type PlatformSettings,
} from "@/lib/api/settings";

/**
 * One request per page load, however many components read the settings —
 * the hero portrait and the spam-folder note can both be on one page.
 */
let shared: Promise<PlatformSettings> | null = null;
function loadSettings(): Promise<PlatformSettings> {
  shared ??= settingsApi.get().catch((error: unknown) => {
    // A failed read is not cached: the next component to ask tries again.
    shared = null;
    throw error;
  });
  return shared;
}

/**
 * Site-wide display toggles, fetched once and shared by every component that
 * reads them. Defaults to `true` (the setting's own default) until the
 * request resolves, so the note is there on first paint rather than flashing
 * in once the fetch completes — the common case is it staying on.
 */
export function useSpamFolderNoteEnabled(): boolean {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    let cancelled = false;
    loadSettings()
      .then((settings) => !cancelled && setEnabled(settings.showSpamFolderNote))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return enabled;
}

export interface MentorPortrait {
  style: MentorCardStyle;
  /** Null = the photo bundled with the site. */
  photoUrl: string | null;
}

/**
 * Which look the hero portrait takes, and which photo it shows. Null until
 * the settings arrive, so the caller can hold the space rather than draw one
 * look and swap it for the other. A failed read falls back to the poster
 * with the bundled photo — the setting's own default.
 */
export function useMentorPortrait(): MentorPortrait | null {
  const [portrait, setPortrait] = useState<MentorPortrait | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadSettings()
      .then((settings) => {
        if (!cancelled) setPortrait({ style: settings.mentorCardStyle, photoUrl: settings.mentorPhotoUrl });
      })
      .catch(() => {
        if (!cancelled) setPortrait({ style: "POSTER", photoUrl: null });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return portrait;
}

/**
 * Whether the store lets buyers download (else they read in the browser).
 * Null until known, so a Download button is not shown and then taken away.
 * A failed read assumes on — the setting's own default; the server refuses a
 * download that is not allowed either way.
 */
export function useStoreDownloadsEnabled(): boolean | null {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadSettings()
      .then((settings) => !cancelled && setEnabled(settings.downloadsEnabled))
      .catch(() => !cancelled && setEnabled(true));
    return () => {
      cancelled = true;
    };
  }, []);

  return enabled;
}

export interface MedPrepLink {
  /** Whether to show it at all. */
  enabled: boolean;
  /** Whether it wears its "New" badge and pulse. Always false while off. */
  highlight: boolean;
}

/**
 * The "Med Prep" crossover in the header, and whether it is still being
 * announced as new. Both are admin switches, so they can be turned off
 * without a deploy — the first the moment that site has a problem, the second
 * once it has stopped being news.
 *
 * Null until the settings arrive, so the header holds its place rather than
 * popping a link in beside the ones already there. A failed read shows
 * nothing: a link to a site we could not confirm is worse than no link.
 */
export function useMedPrepLink(): MedPrepLink | null {
  const [link, setLink] = useState<MedPrepLink | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadSettings()
      .then((settings) => {
        if (cancelled) return;
        setLink({
          enabled: settings.medPrepLinkEnabled,
          highlight: settings.medPrepLinkEnabled && settings.medPrepLinkHighlight,
        });
      })
      .catch(() => {
        if (!cancelled) setLink({ enabled: false, highlight: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return link;
}
