"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Download,
  Loader2,
  Maximize,
  Minimize,
  Minus,
  PanelLeft,
  Plus,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { buttonVariants } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import { storeApi } from "@/lib/api/store";
import { debouncedSaver, localProgressStore, resumePage, serverProgressStore } from "@/lib/reader/progress";
import { loadPreferences, savePreferences, type ReaderPreferences, type ReaderTheme } from "@/lib/reader/preferences";
import { FileChangedError } from "@/lib/reader/signed-range-loader";
import type { FindResult, ReaderEngine, ReaderGrant, ReaderSource } from "@/lib/reader/types";
import { cn } from "@/lib/utils";
import { ReaderSidebar, type SidebarTab } from "./reader-sidebar";

/** What went wrong, and the one thing to do about it. `retry` reopens the reader in place. */
type Failure = { title: string; detail: string; action?: { label: string; href: string } | { label: string; retry: true } };

const THEMES: Array<{ key: ReaderTheme; label: string }> = [
  { key: "light", label: "Light" },
  { key: "sepia", label: "Sepia" },
  { key: "dark", label: "Dark" },
];

/** Below this width the side panel lies over the page instead of beside it. */
const WIDE = 1024;

/**
 * The in-browser reader: one file, full screen, with the controls people
 * expect from an e-reader — page jumps, zoom (buttons, pinch, Ctrl + wheel),
 * search, contents, page strip, light/sepia/dark, and reopening where they
 * left off on any device.
 *
 * It knows nothing about pdf.js (see ReaderEngine) or which API route the
 * file comes from (see ReaderSource).
 */
export function Reader({
  source,
  signedIn,
  requestedBack,
  loginHref,
}: {
  source: ReaderSource;
  signedIn: boolean;
  /** Where "back" goes when the link said; otherwise the library, or the product page for a sample. */
  requestedBack: string | null;
  loginHref: string;
}) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<ReaderEngine | null>(null);
  const [grant, setGrant] = useState<ReaderGrant | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  /** Bumped to open the file again in place (after it changed, or a failure). */
  const [openCount, setOpenCount] = useState(0);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [pageInput, setPageInput] = useState("1");
  // The reader only ever renders in the browser (the route waits for the
  // session first), so preferences can be read up front: no light flash.
  const [preferences, setPreferences] = useState<ReaderPreferences>(() =>
    typeof window === "undefined" ? { theme: "light", sidebar: false } : loadPreferences(),
  );
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window !== "undefined" && preferences.sidebar && window.innerWidth >= WIDE,
  );
  const [sidebarTab, setSidebarTab] = useState<SidebarTab | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [findResult, setFindResult] = useState<FindResult | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const saverRef = useRef<ReturnType<typeof debouncedSaver> | null>(null);
  // Read when the file is opened, not a reason to open it again: a session
  // that ends mid-read keeps the book open (saving falls back to the browser).
  const signedInRef = useRef(signedIn);
  useEffect(() => {
    signedInRef.current = signedIn;
  }, [signedIn]);

  const isSample = source.kind === "sample";
  const productPage = grant?.product.slug ? `/p/${grant.product.slug}` : null;
  const backHref = requestedBack ?? (isSample && productPage ? productPage : "/library");

  const updatePreferences = (patch: Partial<ReaderPreferences>) =>
    setPreferences((current) => {
      const next = { ...current, ...patch };
      savePreferences(next);
      return next;
    });

  // --- open ------------------------------------------------------------------
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const closing = new AbortController();
    let opened: ReaderEngine | null = null;
    const fail = (error: unknown) => {
      if (closing.signal.aborted) return;
      // The first reason wins: a refused piece of the file explains the
      // "could not open" that follows it.
      setFailure((current) => current ?? failureFor(error, loginHref));
    };

    (async () => {
      try {
        const first = await source.open();
        if (closing.signal.aborted) return;
        setGrant(first);

        const signedInNow = signedInRef.current;
        let saved = null;
        if (!isSample) {
          saved =
            first.progress ??
            // Signed in but no position with the grant: ask the account directly,
            // in case the grant was served before a stale sign-in was refreshed.
            (await (signedInNow ? serverProgressStore : localProgressStore).load(source.productId).catch(() => null));
        }
        if (closing.signal.aborted) return;

        opened = await openPdfEngineLazily({
          container,
          source,
          grant: first,
          initialPage: 1,
          signal: closing.signal,
          onGrant: (fresh) => !closing.signal.aborted && setGrant(fresh),
          onOpen: (pageCount) => resumePage(saved, first.asset.id, pageCount),
          onLoadError: fail,
        });
        if (closing.signal.aborted) {
          opened.destroy();
          return;
        }
        setEngine(opened);
        // Ready for the arrow keys and Space without a click first.
        requestAnimationFrame(() => container.focus({ preventScroll: true }));
      } catch (error) {
        fail(error);
      }
    })();

    return () => {
      closing.abort();
      opened?.destroy();
      setEngine(null);
    };
  }, [source, isSample, loginHref, openCount]);

  const reopen = () => {
    setFailure(null);
    setOpenCount((count) => count + 1);
  };

  // --- follow the engine -------------------------------------------------------
  useEffect(() => {
    if (!engine) return;
    const saver = isSample
      ? null
      : debouncedSaver(signedIn ? serverProgressStore : localProgressStore, source.productId);
    saverRef.current = saver;
    const assetId = grant?.asset.id ?? null;

    const offPage = engine.on("pageChange", (next) => {
      setPage(next);
      setPageInput(String(next));
      saver?.save({ page: next, pageCount: engine.pageCount, assetId });
    });
    const offZoom = engine.on("zoomChange", setZoom);
    const offFind = engine.on("findResult", setFindResult);

    // The engine may have moved (to the saved page) before this subscribed.
    const frame = requestAnimationFrame(() => {
      setPage(engine.currentPage);
      setPageInput(String(engine.currentPage));
      setZoom(engine.zoomPercent);
    });

    const leave = () => void saver?.flush({ leaving: true });
    const onVisibility = () => document.visibilityState === "hidden" && leave();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", leave);

    return () => {
      cancelAnimationFrame(frame);
      offPage();
      offZoom();
      offFind();
      leave();
      if (saverRef.current === saver) saverRef.current = null;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", leave);
    };
    // The grant's asset id is fixed for the life of an engine (FileChangedError otherwise).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, isSample, signedIn, source.productId]);

  // --- zoom by pinch and Ctrl + wheel ---------------------------------------------
  useEffect(() => {
    const container = containerRef.current;
    if (!engine || !container) return;

    // A trackpad pinch arrives as Ctrl + wheel. Without this it zooms the
    // whole browser page, controls and all.
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      engine.zoomBy(Math.exp(-event.deltaY / 300), [event.clientX, event.clientY]);
    };

    // Two fingers on a phone. The container's touch-action keeps the browser
    // from zooming the page itself; one finger still scrolls as usual.
    let lastDistance = 0;
    const distance = (touches: TouchList) =>
      Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length === 2) lastDistance = distance(event.touches);
    };
    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length !== 2 || !lastDistance) return;
      event.preventDefault();
      const next = distance(event.touches);
      const factor = next / lastDistance;
      if (Math.abs(factor - 1) < 0.02) return;
      lastDistance = next;
      const [a, b] = [event.touches[0], event.touches[1]];
      engine.zoomBy(factor, [(a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2]);
    };
    const onTouchEnd = (event: TouchEvent) => {
      if (event.touches.length < 2) lastDistance = 0;
    };

    container.addEventListener("wheel", onWheel, { passive: false });
    container.addEventListener("touchstart", onTouchStart, { passive: true });
    container.addEventListener("touchmove", onTouchMove, { passive: false });
    container.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchmove", onTouchMove);
      container.removeEventListener("touchend", onTouchEnd);
    };
  }, [engine]);

  // --- keyboard --------------------------------------------------------------------
  const openSearch = useCallback(() => {
    setSearchOpen(true);
    requestAnimationFrame(() => searchRef.current?.select());
  }, []);

  useEffect(() => {
    if (!engine) return;
    const onKey = (event: KeyboardEvent) => {
      // A dialog (the terms prompt) has the keyboard while it is open.
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      const typing = (event.target as HTMLElement | null)?.closest("input, textarea, [contenteditable]");
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        openSearch();
        return;
      }
      if (event.key === "Escape") {
        setSearchOpen(false);
        engine.clearFind();
        if (window.innerWidth < WIDE) setSidebarOpen(false);
        return;
      }
      if (typing || event.ctrlKey || event.metaKey || event.altKey) return;
      const container = containerRef.current;
      // Zoomed in past the screen's width, left and right pan instead.
      const pansSideways = container ? container.scrollWidth > container.clientWidth + 1 : false;
      if (event.key === "PageDown" || (event.key === "ArrowRight" && !pansSideways)) {
        event.preventDefault();
        engine.goToPage(engine.currentPage + 1);
      } else if (event.key === "PageUp" || (event.key === "ArrowLeft" && !pansSideways)) {
        event.preventDefault();
        engine.goToPage(engine.currentPage - 1);
      } else if (event.key === "+" || event.key === "=") {
        engine.zoomIn();
      } else if (event.key === "-") {
        engine.zoomOut();
      } else if (event.key === "Home") {
        event.preventDefault();
        engine.goToPage(1);
      } else if (event.key === "End") {
        event.preventDefault();
        engine.goToPage(engine.pageCount);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [engine, openSearch]);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // The whole document, not just the reader: messages and the terms prompt
  // render outside the reader and would be invisible in its full screen.
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  };

  const toggleSidebar = () => {
    setSidebarOpen((open) => {
      if (window.innerWidth >= WIDE) updatePreferences({ sidebar: !open });
      return !open;
    });
  };

  const download = async () => {
    setDownloading(true);
    try {
      const { url } = await storeApi.downloadUrl(source.productId);
      window.location.assign(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start the download");
    } finally {
      setDownloading(false);
    }
  };

  /** Back, once the last page turn is saved, so the library shows where they got to. */
  const goBack = async (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const saved = saverRef.current?.flush();
    if (saved) await Promise.race([saved, new Promise((resolve) => setTimeout(resolve, 1500))]);
    router.push(backHref);
  };

  const submitPage = () => {
    const wanted = Number(pageInput);
    if (!engine || !pageInput || !Number.isFinite(wanted)) {
      setPageInput(String(page));
      return;
    }
    const target = Math.min(Math.max(1, Math.round(wanted)), engine.pageCount);
    engine.goToPage(target);
    setPageInput(String(target));
  };

  const pageCount = engine?.pageCount ?? 0;
  const title = grant?.product.title ?? "Opening…";

  return (
    <div
      className={cn(
        "reader fixed inset-0 flex flex-col bg-background text-foreground",
        `reader-theme-${preferences.theme}`,
        // Dark pages get dark controls too: the site's own dark tokens, here only.
        preferences.theme === "dark" && "dark",
      )}
    >
      {/* Top bar */}
      <header className="flex h-12 shrink-0 items-center gap-1 border-b bg-background px-2 sm:gap-2 sm:px-3">
        <Link
          href={backHref}
          onClick={goBack}
          className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
          aria-label="Back"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <IconButton label="Pages and contents" onClick={toggleSidebar} pressed={sidebarOpen} disabled={!engine}>
          <PanelLeft className="size-4" />
        </IconButton>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h1 className="truncate font-display text-sm font-semibold">{title}</h1>
          {isSample && (
            <span className="shrink-0 rounded-full bg-accent px-2.5 py-1 text-[10px] font-bold text-primary">
              Sample
            </span>
          )}
        </div>

        {engine && (
          <form
            className="flex items-center gap-1 text-sm tabular-nums"
            onSubmit={(event) => {
              event.preventDefault();
              submitPage();
              // Back to the pages, so the arrow keys turn them again.
              containerRef.current?.focus({ preventScroll: true });
            }}
          >
            <input
              aria-label="Page number"
              inputMode="numeric"
              value={pageInput}
              onChange={(event) => setPageInput(event.target.value.replace(/\D/g, ""))}
              onBlur={submitPage}
              className="h-7 w-10 rounded-md border bg-transparent text-center text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <span className="whitespace-nowrap text-muted-foreground">/ {pageCount}</span>
          </form>
        )}

        <div className="hidden items-center md:flex">
          <IconButton label="Zoom out" onClick={() => engine?.zoomOut()} disabled={!engine}>
            <Minus className="size-4" />
          </IconButton>
          <button
            type="button"
            onClick={() => engine?.setZoom("page-width")}
            disabled={!engine}
            title="Fit to width"
            aria-label={`Zoom ${zoom}%. Fit to width`}
            className="w-12 rounded-md py-1 text-center text-xs tabular-nums text-muted-foreground hover:text-foreground"
          >
            {zoom}%
          </button>
          <IconButton label="Zoom in" onClick={() => engine?.zoomIn()} disabled={!engine}>
            <Plus className="size-4" />
          </IconButton>
        </div>

        <IconButton label="Search in this PDF" onClick={openSearch} pressed={searchOpen} disabled={!engine}>
          <Search className="size-4" />
        </IconButton>
        <ThemeButton theme={preferences.theme} onChange={(theme) => updatePreferences({ theme })} />
        <span className="hidden sm:contents">
          <IconButton label={fullscreen ? "Exit full screen" : "Full screen"} onClick={toggleFullscreen}>
            {fullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
          </IconButton>
        </span>
        {!isSample && grant?.downloadAllowed && (
          <IconButton label="Download PDF" onClick={download} disabled={downloading}>
            {downloading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          </IconButton>
        )}
      </header>

      {/* Search */}
      {searchOpen && (
        <div className="flex shrink-0 items-center gap-2 border-b bg-background px-3 py-2">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={searchRef}
            value={query}
            placeholder="Search in this PDF"
            aria-label="Search in this PDF"
            onChange={(event) => {
              setQuery(event.target.value);
              if (event.target.value.trim()) engine?.find(event.target.value.trim(), { again: false });
              else {
                engine?.clearFind();
                setFindResult(null);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && query.trim()) {
                event.preventDefault();
                engine?.find(query.trim(), { again: true, previous: event.shiftKey });
              }
            }}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground" aria-live="polite">
            {query.trim() && findResult
              ? findResult.state === "not-found"
                ? "No matches"
                : findResult.total > 0
                  ? `${findResult.current} of ${findResult.total}`
                  : "Searching…"
              : ""}
          </span>
          <IconButton
            label="Previous match"
            onClick={() => query.trim() && engine?.find(query.trim(), { again: true, previous: true })}
          >
            <ChevronUp className="size-4" />
          </IconButton>
          <IconButton label="Next match" onClick={() => query.trim() && engine?.find(query.trim(), { again: true })}>
            <ChevronDown className="size-4" />
          </IconButton>
          <IconButton
            label="Close search"
            onClick={() => {
              setSearchOpen(false);
              engine?.clearFind();
            }}
          >
            <X className="size-4" />
          </IconButton>
        </div>
      )}

      <div className="relative flex min-h-0 flex-1">
        {/* Side panel: beside the page on wide screens, over it on phones. */}
        {engine && sidebarOpen && (
          <>
            <button
              type="button"
              aria-label="Close panel"
              onClick={() => setSidebarOpen(false)}
              className="absolute inset-0 z-20 bg-black/30 lg:hidden"
            />
            <aside className="absolute inset-y-0 left-0 z-30 w-64 border-r bg-background shadow-lg lg:static lg:shadow-none">
              <ReaderSidebar
                engine={engine}
                currentPage={page}
                tab={sidebarTab}
                onTabChange={setSidebarTab}
                onNavigate={() => window.innerWidth < WIDE && setSidebarOpen(false)}
              />
            </aside>
          </>
        )}

        {/* The pages. pdf.js requires an absolutely positioned scroll container. */}
        <div className="reader-canvas relative min-w-0 flex-1">
          <div
            ref={containerRef}
            className="absolute inset-0 touch-pan-x touch-pan-y overflow-auto outline-none"
            tabIndex={0}
            aria-label="Document"
          >
            <div className="pdfViewer" />
          </div>

          {!engine && !failure && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
              <Loader2 className="size-6 animate-spin" />
              Opening…
            </div>
          )}

          {failure && (
            <div className="absolute inset-0 flex items-center justify-center bg-background p-6">
              <div className="max-w-sm text-center">
                <h2 className="font-display text-lg font-semibold text-brand-ink">{failure.title}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{failure.detail}</p>
                <div className="mt-5 flex justify-center gap-2">
                  {failure.action &&
                    ("retry" in failure.action ? (
                      <button type="button" onClick={reopen} className={buttonVariants()}>
                        {failure.action.label}
                      </button>
                    ) : (
                      <Link href={failure.action.href} className={buttonVariants()}>
                        {failure.action.label}
                      </Link>
                    ))}
                  <Link href={backHref} className={buttonVariants({ variant: "outline" })}>
                    Go back
                  </Link>
                </div>
              </div>
            </div>
          )}

          {isSample && engine && page >= pageCount && (
            <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-4">
              <div className="pointer-events-auto flex items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-editorial">
                <p className="text-sm">That&apos;s the end of the sample.</p>
                <Link href={productPage ?? backHref} className={buttonVariants({ size: "sm" })}>
                  Get the full PDF
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* How far through */}
      <div className="h-1 shrink-0 bg-muted" aria-hidden>
        <div
          className="h-full bg-primary transition-[width] duration-300"
          style={{ width: pageCount ? `${(page / pageCount) * 100}%` : 0 }}
        />
      </div>
    </div>
  );
}

/** Loaded on demand: pdf.js is large and only this screen needs it. */
async function openPdfEngineLazily(options: Parameters<typeof import("./pdf-engine").openPdfEngine>[0]) {
  const { openPdfEngine } = await import("./pdf-engine");
  return openPdfEngine(options);
}

function failureFor(error: unknown, loginHref: string): Failure {
  if (error instanceof FileChangedError) {
    return {
      title: "This PDF was updated",
      detail: "A newer version was published while you were reading. Reopen it to continue in the new version.",
      action: { label: "Reopen", retry: true },
    };
  }
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return {
        title: "Sign in to read",
        detail: "This PDF is in a JSMF library. Sign in with the account that has it.",
        action: { label: "Sign in", href: loginHref },
      };
    }
    if (error.status === 403) {
      return { title: "Not in your library", detail: error.message };
    }
    if (error.status === 404 || error.status === 400) {
      return {
        title: "Nothing to read here",
        detail: error.status === 404 ? error.message : "This link does not point to a PDF in the store.",
      };
    }
  }
  return {
    title: "Could not open the PDF",
    detail: "Check your connection and try again. If it keeps happening, let us know.",
    action: { label: "Try again", retry: true },
  };
}

function IconButton({
  label,
  onClick,
  pressed,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  pressed?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40",
        pressed && "bg-secondary text-secondary-foreground",
      )}
    >
      {children}
    </button>
  );
}

/** Cycles light → sepia → dark. Shows an "Aa" swatch in the current page colour, as e-readers do. */
function ThemeButton({ theme, onChange }: { theme: ReaderTheme; onChange: (theme: ReaderTheme) => void }) {
  const index = Math.max(0, THEMES.findIndex((item) => item.key === theme));
  const current = THEMES[index];
  const next = THEMES[(index + 1) % THEMES.length];
  return (
    <IconButton label={`${current.label} pages — switch to ${next.label.toLowerCase()}`} onClick={() => onChange(next.key)}>
      <span
        aria-hidden
        className="grid size-5 place-items-center rounded-[5px] border border-current/40 bg-(--reader-page) font-serif text-[10px] font-semibold leading-none text-foreground"
      >
        Aa
      </span>
    </IconButton>
  );
}
