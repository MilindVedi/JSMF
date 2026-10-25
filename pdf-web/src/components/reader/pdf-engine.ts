import type {
  FindResult,
  OutlineItem,
  ReaderEngine,
  ReaderEvents,
  ReaderGrant,
  ReaderSource,
  ZoomMode,
} from "@/lib/reader/types";
import { SignedRangeLoader } from "@/lib/reader/signed-range-loader";

/**
 * The pdf.js implementation of ReaderEngine — the only file that imports
 * pdf.js. It is loaded in the browser alone (pdf.js needs the DOM and a
 * worker), on demand, so pages that never open the reader never pay for it.
 *
 * pdf.js's own viewer does the hard parts: only the pages near the screen are
 * drawn, text can be selected and searched, links inside the PDF work.
 *
 * The legacy build, not the modern one: the modern build relies on browser
 * features from 2024 (iterator helpers, Promise.withResolvers) and fails on
 * iPhones a year or two behind. The legacy build carries polyfills for them.
 */

/** Fonts and character maps some PDFs need, from the same pdf.js release. */
const PDFJS_ASSETS = "https://cdn.jsdelivr.net/npm/pdfjs-dist@5.7.284";
/** Ask storage for 256 KB at a time: few requests, little waste. */
const RANGE_CHUNK_BYTES = 256 * 1024;
/** Zoom presets that depend on the reading area's size, re-fitted when it changes. */
const FITTED: readonly string[] = ["auto", "page-width", "page-fit"];

const FIND_STATES: Record<number, FindResult["state"]> = { 0: "found", 1: "not-found", 2: "wrapped", 3: "pending" };

/** Thrown when the reader closed before the document finished opening. */
export class OpenCancelledError extends Error {
  constructor() {
    super("The reader was closed before the PDF opened.");
    this.name = "AbortError";
  }
}

export async function openPdfEngine(options: {
  container: HTMLDivElement;
  source: ReaderSource;
  grant: ReaderGrant;
  initialPage: number;
  /** Closing the reader mid-open: everything started so far is torn down. */
  signal?: AbortSignal;
  onGrant?: (grant: ReaderGrant) => void;
  /** Called with the real page count once the document is open, before the first page shows. */
  onOpen?: (pageCount: number) => number | void;
  /** A piece of the file failed for good, after the document opened or while it was opening. */
  onLoadError?: (error: Error) => void;
}): Promise<ReaderEngine> {
  const { container, source, grant, signal } = options;
  const cancelled = () => {
    if (signal?.aborted) throw new OpenCancelledError();
  };

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const viewerModule = await import("pdfjs-dist/legacy/web/pdf_viewer.mjs");
  // Imported here rather than globally so the store's other pages never load it.
  await import("pdfjs-dist/legacy/web/pdf_viewer.css");
  cancelled();

  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const loader = new SignedRangeLoader(source, grant, options.onGrant);
  // One switch for everything the viewer attaches (scroll, resize, text
  // selection listeners), so closing the reader leaves nothing behind.
  const teardown = new AbortController();

  // Pieces of the file are fetched through the loader, which keeps the
  // signed link fresh. Without a known size pdf.js fetches the file itself.
  let range: InstanceType<typeof pdfjs.PDFDataRangeTransport> | undefined;
  let opened = false;
  if (grant.asset.sizeBytes) {
    range = new pdfjs.PDFDataRangeTransport(grant.asset.sizeBytes, null);
    const transport = range;
    transport.requestDataRange = (begin: number, end: number) => {
      loader
        .fetchRange(begin, end)
        .then((chunk) => transport.onDataRange(begin, chunk))
        .catch((error: unknown) => {
          if ((error as { name?: string }).name === "AbortError") return;
          options.onLoadError?.(error instanceof Error ? error : new Error(String(error)));
          // Still opening: pdf.js would wait for this piece forever.
          if (!opened) void task.destroy();
        });
    };
  }

  const task = pdfjs.getDocument({
    ...(range ? { range, length: grant.asset.sizeBytes ?? undefined } : { url: grant.url }),
    rangeChunkSize: RANGE_CHUNK_BYTES,
    // Fetch only what is being read, not the rest of the book in the background.
    disableAutoFetch: true,
    disableStream: true,
    cMapUrl: `${PDFJS_ASSETS}/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${PDFJS_ASSETS}/standard_fonts/`,
    wasmUrl: `${PDFJS_ASSETS}/wasm/`,
  });
  const abandon = () => {
    loader.abort();
    teardown.abort();
    void task.destroy();
  };
  signal?.addEventListener("abort", abandon, { once: true });

  const document = await task.promise;
  opened = true;
  cancelled();

  const eventBus = new viewerModule.EventBus();
  const linkService = new viewerModule.PDFLinkService({
    eventBus,
    // A web link in the PDF opens beside the reader, never in place of it.
    externalLinkTarget: viewerModule.LinkTarget.BLANK,
    externalLinkRel: "noopener noreferrer nofollow",
  });
  const findController = new viewerModule.PDFFindController({ eventBus, linkService });
  const viewerElement = container.querySelector<HTMLDivElement>(".pdfViewer") ?? undefined;
  // `abortSignal` is a real PDFViewer option in 5.7 (pdf_viewer.mjs reads it)
  // that its type declarations leave out.
  type ViewerOptions = ConstructorParameters<typeof viewerModule.PDFViewer>[0] & { abortSignal?: AbortSignal };
  const viewerOptions: ViewerOptions = {
    container,
    viewer: viewerElement,
    eventBus,
    linkService,
    findController,
    removePageBorders: false,
    abortSignal: teardown.signal,
  };
  const viewer = new viewerModule.PDFViewer(viewerOptions);
  linkService.setViewer(viewer);

  const startPage = Math.min(
    Math.max(1, (options.onOpen?.(document.numPages) as number | undefined) ?? options.initialPage),
    document.numPages,
  );

  const listeners: { [E in keyof ReaderEvents]: Set<ReaderEvents[E]> } = {
    pageChange: new Set(),
    zoomChange: new Set(),
    findResult: new Set(),
  };
  const emit = <E extends keyof ReaderEvents>(event: E, ...args: Parameters<ReaderEvents[E]>) => {
    for (const listener of listeners[event]) (listener as (...a: Parameters<ReaderEvents[E]>) => void)(...args);
  };

  // Whether the reader has moved on their own — only real input counts, not
  // the page events pdf.js sends while laying the document out.
  let userMoved = false;
  for (const type of ["wheel", "touchstart", "keydown", "pointerdown"]) {
    container.addEventListener(type, () => (userMoved = true), { once: true, passive: true, signal: teardown.signal });
  }
  eventBus.on("pagesinit", () => {
    viewer.currentScaleValue = window.innerWidth < 768 ? "page-width" : "auto";
    if (startPage > 1) viewer.currentPageNumber = startPage;
  });
  // Until every page's real size is known, pages are laid out at the first
  // page's size, so a resumed page can drift by one as the others arrive.
  // Put it back once, unless the reader has already moved on their own.
  eventBus.on("pagesloaded", () => {
    if (startPage > 1 && !userMoved) viewer.currentPageNumber = startPage;
  });
  eventBus.on("pagechanging", ({ pageNumber }: { pageNumber: number }) => emit("pageChange", pageNumber));
  eventBus.on("scalechanging", ({ scale }: { scale: number }) => emit("zoomChange", Math.round(scale * 100)));
  eventBus.on(
    "updatefindcontrolstate",
    ({ state, matchesCount }: { state: number; matchesCount: { current: number; total: number } }) =>
      emit("findResult", { state: FIND_STATES[state] ?? "pending", ...matchesCount }),
  );
  eventBus.on("updatefindmatchescount", ({ matchesCount }: { matchesCount: { current: number; total: number } }) =>
    emit("findResult", { state: "found", ...matchesCount }),
  );

  viewer.setDocument(document);
  linkService.setDocument(document, null);

  // "Fit to width" has to be fitted again when the reading area changes size:
  // the side panel opening, a phone turning, full screen.
  let refit = 0;
  const resize = new ResizeObserver(() => {
    cancelAnimationFrame(refit);
    refit = requestAnimationFrame(() => {
      const preset = viewer.currentScaleValue;
      if (FITTED.includes(preset)) viewer.currentScaleValue = preset;
    });
  });
  resize.observe(container);

  // Thumbnails are drawn one after another, never all at once: a fast scroll
  // down the strip would otherwise start dozens of renders, each fetching its
  // page's images.
  let thumbnails: Promise<unknown> = Promise.resolve();

  let lastQuery = "";

  const engine: ReaderEngine = {
    get pageCount() {
      return document.numPages;
    },
    get currentPage() {
      return viewer.currentPageNumber;
    },
    get zoomPercent() {
      return Math.round(viewer.currentScale * 100);
    },
    goToPage(page) {
      userMoved = true;
      viewer.currentPageNumber = Math.min(Math.max(1, Math.round(page)), document.numPages);
    },
    zoomIn() {
      viewer.increaseScale();
    },
    zoomOut() {
      viewer.decreaseScale();
    },
    zoomBy(factor, origin) {
      // Pages are stretched at once and redrawn sharp when the gesture pauses,
      // not on every finger movement.
      viewer.updateScale({ scaleFactor: factor, origin, drawingDelay: 300 });
    },
    setZoom(mode: ZoomMode) {
      viewer.currentScaleValue = mode;
    },
    find(query, findOptions = {}) {
      const again = findOptions.again ?? query === lastQuery;
      lastQuery = query;
      eventBus.dispatch("find", {
        source: null,
        type: again ? "again" : "",
        query,
        caseSensitive: false,
        entireWord: false,
        highlightAll: true,
        findPrevious: Boolean(findOptions.previous),
        matchDiacritics: false,
      });
    },
    clearFind() {
      lastQuery = "";
      eventBus.dispatch("findbarclose", { source: null });
    },
    async outline() {
      const raw = await document.getOutline();
      const convert = (items: NonNullable<typeof raw>): OutlineItem[] =>
        items.map((item) => ({ title: item.title, target: item.dest ?? null, children: convert(item.items ?? []) }));
      return raw ? convert(raw) : [];
    },
    goToOutline(item) {
      userMoved = true;
      if (item.target) void linkService.goToDestination(item.target as string | unknown[]);
    },
    renderThumbnail(page, width, thumbnailSignal) {
      const drawn = thumbnails.then(async () => {
        if (thumbnailSignal?.aborted || teardown.signal.aborted) return null;
        const pdfPage = await document.getPage(page);
        try {
          const base = pdfPage.getViewport({ scale: 1 });
          const ratio = Math.min(window.devicePixelRatio || 1, 2);
          const viewport = pdfPage.getViewport({ scale: (width / base.width) * ratio });
          const canvas = window.document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          await pdfPage.render({ canvas, viewport }).promise;
          const image = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
          // Release the pixels now rather than whenever the canvas is collected.
          canvas.width = 0;
          canvas.height = 0;
          return image;
        } finally {
          pdfPage.cleanup();
        }
      });
      thumbnails = drawn.catch(() => undefined);
      return drawn;
    },
    on(event, listener) {
      (listeners[event] as Set<typeof listener>).add(listener);
      return () => {
        (listeners[event] as Set<typeof listener>).delete(listener);
      };
    },
    destroy() {
      signal?.removeEventListener("abort", abandon);
      resize.disconnect();
      cancelAnimationFrame(refit);
      loader.abort();
      // setDocument(null) is what cancels each page's text layer, and with it
      // pdf.js's document-wide selection listeners and the pages' canvases.
      // (It resets the find controller too.)
      viewer.setDocument(null as never);
      linkService.setDocument(null, null);
      teardown.abort();
      void task.destroy();
    },
  };

  return engine;
}
