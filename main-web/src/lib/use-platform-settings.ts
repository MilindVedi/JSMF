import { useEffect, useState } from "react";
import { settingsApi } from "@/lib/api/settings";

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
    settingsApi
      .get()
      .then((settings) => !cancelled && setEnabled(settings.showSpamFolderNote))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return enabled;
}
