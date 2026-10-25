import { api } from "@/lib/api/client";
import type { ProgressStore, ReadingPosition } from "./types";

const LOCAL_PREFIX = "jsmf.reader.position.";

/** The signed-in reader's place, kept on the server so every device opens at it. */
export const serverProgressStore: ProgressStore = {
  async load(productId) {
    const { progress } = await api.get<{ progress: ReadingPosition | null }>(`/me/reading/${productId}`);
    return progress;
  },
  async save(productId, position, options) {
    await api.put(
      `/me/reading/${productId}`,
      {
        page: position.page,
        pageCount: position.pageCount,
        ...(position.assetId ? { assetId: position.assetId } : {}),
      },
      { keepalive: options?.leaving },
    );
  },
};

/**
 * A visitor's place, in this browser only. Storage can be unavailable (private
 * windows, blocked site data); the reader then simply starts at page 1.
 */
export const localProgressStore: ProgressStore = {
  async load(productId) {
    try {
      const raw = window.localStorage.getItem(LOCAL_PREFIX + productId);
      return raw ? (JSON.parse(raw) as ReadingPosition) : null;
    } catch {
      return null;
    }
  },
  async save(productId, position) {
    try {
      window.localStorage.setItem(
        LOCAL_PREFIX + productId,
        JSON.stringify({ ...position, updatedAt: new Date().toISOString() }),
      );
    } catch {
      // Nowhere to keep it; nothing to do.
    }
  },
};

/**
 * Saves the position a short while after the reader stops turning pages, and
 * at once when asked (leaving the page, hiding the tab) — so flicking through
 * twenty pages is one save, not twenty.
 */
export function debouncedSaver(store: ProgressStore, productId: string, delayMs = 1500) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: ReadingPosition | null = null;
  let lastSaved = "";

  /** Saves what is pending now. Resolves when it is saved (or failed); never rejects. */
  const flush = (options?: { leaving?: boolean }): Promise<void> => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!pending) return Promise.resolve();
    const position = pending;
    pending = null;
    const key = `${position.page}/${position.pageCount}/${position.assetId}`;
    if (key === lastSaved) return Promise.resolve();
    lastSaved = key;
    return store.save(productId, position, options).catch(() => {
      // A failed save is not worth interrupting reading for; the next page
      // turn tries again.
      lastSaved = "";
    });
  };

  return {
    save(position: ReadingPosition) {
      pending = position;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void flush(), delayMs);
    },
    flush,
  };
}

/** The page to reopen at, kept inside the file as it is now. */
export function resumePage(position: ReadingPosition | null, assetId: string, pageCount: number): number {
  if (!position) return 1;
  // The same file: exactly where they were. A replaced file: the same place,
  // proportionally, which is closer than page 1 for a revised edition.
  const page =
    !position.assetId || position.assetId === assetId
      ? position.page
      : Math.round((position.page / Math.max(1, position.pageCount)) * pageCount);
  return Math.min(Math.max(1, page), pageCount);
}
