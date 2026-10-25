/**
 * The reader's contracts. Everything else in the reader depends on these, never
 * on pdf.js or on a particular API route, so the rendering engine, where the
 * file comes from, and where the reading position is kept can each be swapped
 * on its own — for the mobile apps, an offline copy, or a different engine.
 */

/** Where the reader stopped, for one product. Pages are 1-based. */
export interface ReadingPosition {
  page: number;
  pageCount: number;
  /** The file version `page` belongs to. A replaced file may have different pages. */
  assetId: string | null;
  updatedAt?: string;
}

/** A short-lived permission to read one file, as the API hands it out. */
export interface ReaderGrant {
  url: string;
  expiresAt: string;
  /** How long the link lives from now. Preferred over `expiresAt`: a device clock can be wrong. */
  expiresInSeconds?: number;
  asset: { id: string; version: number; sizeBytes: number | null; pageCount: number | null };
  product: { id: string; title: string; slug?: string };
  /** Whether a Download button belongs beside the reader. */
  downloadAllowed: boolean;
  /** The signed-in reader's saved place, if any. */
  progress: ReadingPosition | null;
}

/**
 * Where the bytes come from. `open` is the first request; `renew` is asked
 * for a fresh link when the last one expires part-way through reading.
 */
export interface ReaderSource {
  /** "full" reads the product; "sample" reads its preview. */
  readonly kind: "full" | "sample";
  readonly productId: string;
  open(): Promise<ReaderGrant>;
  renew(): Promise<ReaderGrant>;
}

/** Keeps the reading position. Signed-in readers keep it on the server, everyone else in this browser. */
export interface ProgressStore {
  load(productId: string): Promise<ReadingPosition | null>;
  /** `leaving`: the page is closing, so the save must outlive it. */
  save(productId: string, position: ReadingPosition, options?: { leaving?: boolean }): Promise<void>;
}

export interface OutlineItem {
  title: string;
  /** Opaque to the UI: handed back to `ReaderEngine.goToOutline`. Null for an entry that goes nowhere. */
  target: unknown;
  children: OutlineItem[];
}

export type ZoomMode = "page-width" | "page-fit" | "auto";

/** One page at a time (turned sideways), or one continuous vertical scroll. */
export type ReaderLayout = "paged" | "scroll";

export interface FindResult {
  current: number;
  total: number;
  /** "found" | "not-found" | "pending" | "wrapped". */
  state: "found" | "not-found" | "pending" | "wrapped";
}

export interface ReaderEvents {
  pageChange: (page: number) => void;
  zoomChange: (percent: number) => void;
  findResult: (result: FindResult) => void;
}

/**
 * The rendering engine, as the reader UI sees it. The pdf.js implementation is
 * in components/reader/pdf-engine.ts; nothing outside it imports pdf.js.
 */
export interface ReaderEngine {
  readonly pageCount: number;
  readonly currentPage: number;
  /** Current zoom, in percent. */
  readonly zoomPercent: number;
  readonly layout: ReaderLayout;
  /** Switches layout in place, keeping the page, and fits the page to the new layout. */
  setLayout(layout: ReaderLayout): void;
  goToPage(page: number): void;
  zoomIn(): void;
  zoomOut(): void;
  /** Zooms by a factor (pinch, Ctrl + wheel), keeping the point under `origin` (client pixels) in place. */
  zoomBy(factor: number, origin?: [number, number]): void;
  setZoom(mode: ZoomMode): void;
  /** Starts a search, or moves to the next/previous match of the same one. */
  find(query: string, options?: { previous?: boolean; again?: boolean }): void;
  clearFind(): void;
  outline(): Promise<OutlineItem[]>;
  goToOutline(item: OutlineItem): void;
  /**
   * A small picture of a page, `width` CSS pixels wide, as an image — not a
   * live canvas, so a long strip of them stays light. Drawn one at a time;
   * null if `signal` aborted before its turn came.
   */
  renderThumbnail(page: number, width: number, signal?: AbortSignal): Promise<Blob | null>;
  on<E extends keyof ReaderEvents>(event: E, listener: ReaderEvents[E]): () => void;
  destroy(): void;
}
