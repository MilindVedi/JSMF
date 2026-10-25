import type { ReaderLayout } from "./types";

/** How pages are tinted. Applied as a filter on the page images, so text stays sharp. */
export type ReaderTheme = "light" | "sepia" | "dark";

export interface ReaderPreferences {
  theme: ReaderTheme;
  /** One page at a time, turned sideways like an e-reader (the default), or one continuous scroll. */
  layout: ReaderLayout;
  /** Whether the side panel (pages / contents) is open on wide screens. */
  sidebar: boolean;
}

const KEY = "jsmf.reader.preferences";
const THEMES: readonly ReaderTheme[] = ["light", "sepia", "dark"];
const LAYOUTS: readonly ReaderLayout[] = ["paged", "scroll"];

/** Until a reader picks a page colour, pages follow the site's light or dark theme. */
function defaults(): ReaderPreferences {
  const siteIsDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
  return { theme: siteIsDark ? "dark" : "light", layout: "paged", sidebar: false };
}

/** Per-browser conveniences only; nothing breaks when storage is unavailable or edited by hand. */
export function loadPreferences(): ReaderPreferences {
  const fallback = defaults();
  try {
    const raw = window.localStorage.getItem(KEY);
    const saved = raw ? (JSON.parse(raw) as Partial<ReaderPreferences> | null) : null;
    return {
      theme: saved && THEMES.includes(saved.theme as ReaderTheme) ? (saved.theme as ReaderTheme) : fallback.theme,
      layout: saved && LAYOUTS.includes(saved.layout as ReaderLayout) ? (saved.layout as ReaderLayout) : fallback.layout,
      sidebar: typeof saved?.sidebar === "boolean" ? saved.sidebar : fallback.sidebar,
    };
  } catch {
    return fallback;
  }
}

export function savePreferences(preferences: ReaderPreferences): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(preferences));
  } catch {
    // Not kept; the reader still works.
  }
}
