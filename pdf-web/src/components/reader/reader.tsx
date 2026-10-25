"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Download,
  GalleryHorizontalEnd,
  Loader2,
  Maximize,
  Minimize,
  Minus,
  PanelLeft,
  Plus,
  Rows3,
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
import type { FindResult, ReaderEngine, ReaderGrant, ReaderLayout, ReaderSource } from "@/lib/reader/types";
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
/** A swipe: at least this far sideways, and mostly sideways. */
const SWIPE_PX = 50;
/** On touch, a tap this close to the left or right edge turns the page, as on an e-reader. */
const TAP_ZONE = 0.22;
/** Wheel events closer together than this are one gesture (a flick, a spin, a trackpad's glide). */
const WHEEL_GESTURE_GAP_MS = 150;
/** A sideways trackpad swipe: this far sideways in total, and mostly sideways. */
const WHEEL_SWIPE_PX = 40;
/** Swipes starting this close to the screen's own edge belong to the phone (iOS "back"). */
const SCREEN_EDGE_PX = 16;

/**
 * The in-browser reader: one file, full screen, with the controls people
 * expect from an e-reader — one page at a time turned sideways (or one long
 * scroll, if the reader prefers), page jumps, zoom (buttons, pinch, Ctrl +
 * wheel), search, contents, page strip, light/sepia/dark, and reopening where
 * they left off on any device.
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
    typeof window === "undefined" ? { theme: "light", layout: "paged", sidebar: false } : loadPreferences(),
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
  // The layout the file opens in; switching later happens in place (below).
  const layoutRef = useRef<ReaderLayout>(preferences.layout);
  useEffect(() => {
    layoutRef.current = preferences.layout;
  }, [preferences.layout]);
  const paged = preferences.layout === "paged";

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
          layout: layoutRef.current,
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

  // --- layout ----------------------------------------------------------------------
  useEffect(() => {
    engine?.setLayout(preferences.layout);
  }, [engine, preferences.layout]);

  // --- turning pages and zooming by touch, wheel and trackpad ---------------------
  useEffect(() => {
    const container = containerRef.current;
    if (!engine || !container) return;
    const turns = engine.layout === "paged";

    const atEdge = (forward: boolean) => pageAtEdge(container, forward);
    const pansSideways = () => container.scrollWidth > container.clientWidth + 1;
    const turn = (forward: boolean, options?: { toBottom?: boolean }) =>
      turnPage(engine, container, forward, options);

    // A sideways trackpad swipe is the browser's "back" in Chrome; while
    // reading one page at a time it turns the page instead.
    const root = document.documentElement;
    const overscrollBefore = root.style.overscrollBehaviorX;
    if (turns) root.style.overscrollBehaviorX = "none";

    // A trackpad pinch arrives as Ctrl + wheel. Without this it zooms the
    // whole browser page, controls and all.
    //
    // One page at a time, the wheel turns pages per gesture, not per event:
    // events close together (a flick and its glide, a fast spin) are one
    // gesture and turn at most one page. A gesture turns the page only if it
    // starts with the page already at that edge — a glide that reaches the
    // bottom mid-way stops there, and the next flick turns.
    let gesture = { last: 0, dx: 0, dy: 0, startedAtEdge: false, turned: false };
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        engine.zoomBy(Math.exp(-event.deltaY / 300), [event.clientX, event.clientY]);
        return;
      }
      if (!turns) return;
      const now = performance.now();
      const vertical = Math.abs(event.deltaY) >= Math.abs(event.deltaX);
      if (now - gesture.last > WHEEL_GESTURE_GAP_MS) {
        gesture = {
          last: now,
          dx: 0,
          dy: 0,
          startedAtEdge: vertical && event.deltaY !== 0 && atEdge(event.deltaY > 0),
          turned: false,
        };
      }
      gesture.last = now;
      gesture.dx += event.deltaX;
      gesture.dy += event.deltaY;

      if (gesture.turned) {
        event.preventDefault(); // the rest of the glide must not scroll the new page
        return;
      }
      if (!vertical) {
        if (pansSideways()) return;
        event.preventDefault();
        if (Math.abs(gesture.dx) >= WHEEL_SWIPE_PX && Math.abs(gesture.dx) > 2 * Math.abs(gesture.dy)) {
          gesture.turned = true;
          turn(gesture.dx > 0);
        }
        return;
      }
      const forward = event.deltaY > 0;
      if (!gesture.startedAtEdge || !atEdge(forward)) return;
      event.preventDefault();
      gesture.turned = true;
      // Back by wheel continues reading upwards: the bottom of the previous page.
      turn(forward, { toBottom: !forward });
    };

    // Two fingers on a phone zoom. The container's touch-action keeps the
    // browser from zooming the page itself; one finger scrolls as usual, and,
    // one page at a time, a sideways swipe or a tap near an edge turns it.
    let lastDistance = 0;
    let start: { x: number; y: number; time: number; multi: boolean } | null = null;
    const distance = (touches: TouchList) =>
      Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length === 2) {
        lastDistance = distance(event.touches);
        if (start) start.multi = true;
      } else if (event.touches.length === 1) {
        const touch = event.touches[0];
        start = { x: touch.clientX, y: touch.clientY, time: performance.now(), multi: false };
      }
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
      if (!turns || !start || start.multi || event.touches.length > 0) return;
      const touch = event.changedTouches[0];
      const began = start;
      start = null;
      if (!touch || performance.now() - began.time >= 600 || pansSideways()) return;
      const dx = touch.clientX - began.x;
      const dy = touch.clientY - began.y;
      // Selecting text by dragging is not a swipe, and a tap that ends a
      // selection is not a page turn.
      if (window.getSelection()?.toString()) return;

      const fromScreenEdge = began.x < SCREEN_EDGE_PX || began.x > window.innerWidth - SCREEN_EDGE_PX;
      if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) {
        if (fromScreenEdge) return;
        event.preventDefault();
        turn(dx < 0); // the page follows the finger: swipe left for the next one
        return;
      }
      const tap = Math.abs(dx) < 10 && Math.abs(dy) < 10;
      const onControl = (event.target as HTMLElement | null)?.closest(
        "a, button, input, select, textarea, [role=button], .annotationLayer section",
      );
      if (!tap || onControl) return;
      const box = container.getBoundingClientRect();
      const at = (touch.clientX - box.left) / box.width;
      if (at >= TAP_ZONE && at <= 1 - TAP_ZONE) return;
      // No click after the turn: it would land on whatever the new page has there (a link).
      event.preventDefault();
      turn(at > 1 - TAP_ZONE);
    };

    container.addEventListener("wheel", onWheel, { passive: false });
    container.addEventListener("touchstart", onTouchStart, { passive: true });
    container.addEventListener("touchmove", onTouchMove, { passive: false });
    container.addEventListener("touchend", onTouchEnd, { passive: false });
    return () => {
      root.style.overscrollBehaviorX = overscrollBefore;
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchmove", onTouchMove);
      container.removeEventListener("touchend", onTouchEnd);
    };
  }, [engine, preferences.layout]);

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
      // Usually an element; the window or document when nothing has focus.
      const target = event.target instanceof Element ? event.target : null;
      const typing = target?.closest("input, textarea, [contenteditable]");
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
      // Keys that belong to what has focus: Space and Enter press a button or
      // follow a link; arrows move between tabs; the side panel scrolls itself.
      if (event.key === " " && target?.closest("button, a, [role=button], select, summary")) return;
      if (target?.closest("aside, [role=tablist], select, [role=listbox], [role=slider]")) return;
      // Holding a key down is not reading: one page per press.
      const turnKey = [" ", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "PageUp", "PageDown"].includes(event.key);
      if (event.repeat && turnKey && engine.layout === "paged") {
        event.preventDefault();
        return;
      }
      const container = containerRef.current;
      // Zoomed in past the screen's width, left and right pan instead.
      const pansSideways = container ? container.scrollWidth > container.clientWidth + 1 : false;
      // One page at a time, down/up and Space scroll within the page, then
      // turn it at the edge.
      if (engine.layout === "paged" && container && ["ArrowDown", "ArrowUp", " "].includes(event.key)) {
        const forward = event.key !== "ArrowUp" && !(event.key === " " && event.shiftKey);
        if (pageAtEdge(container, forward)) {
          event.preventDefault();
          // Back by ↑ continues reading upwards: the bottom of the previous page.
          turnPage(engine, container, forward, { toBottom: !forward });
        }
        return;
      }
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
        <IconButton
          label={paged ? "One page at a time — switch to scrolling" : "Scrolling — switch to one page at a time"}
          onClick={() => updatePreferences({ layout: paged ? "scroll" : "paged" })}
          disabled={!engine}
        >
          {paged ? <GalleryHorizontalEnd className="size-4" /> : <Rows3 className="size-4" />}
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
            className="absolute inset-0 touch-pan-x touch-pan-y overflow-auto overscroll-contain outline-none"
            tabIndex={0}
            aria-label="Document"
          >
            <div className="pdfViewer" />
          </div>

          {/* One page at a time on a computer: arrows either side, quiet until the pointer is near. */}
          {engine && paged && !failure && (
            <>
              <PageArrow side="left" disabled={page <= 1} onClick={() => engine.goToPage(page - 1)} />
              <PageArrow side="right" disabled={page >= pageCount} onClick={() => engine.goToPage(page + 1)} />
            </>
          )}

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
      onMouseDown={keepReadingFocus}
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

/**
 * One page at a time: whether the page's own bottom (or top) is in view, so a
 * further push turns the page. Until then — zoomed in, or a phone reading a
 * tall page at full width — scrolling scrolls. Measured on the page, not the
 * scroll offset, which includes the page's margin.
 */
function pageAtEdge(container: HTMLElement, forward: boolean): boolean {
  const page = container.querySelector(".pdfViewer .page")?.getBoundingClientRect();
  if (!page) return true;
  const box = container.getBoundingClientRect();
  return forward ? page.bottom <= box.bottom + 2 : page.top >= box.top - 2;
}

/**
 * A mouse click on a reader control leaves the keyboard where it was — on the
 * pages — so Space and the arrows keep turning them instead of pressing the
 * button again. Tabbing to a control still focuses it as usual.
 */
function keepReadingFocus(event: React.MouseEvent) {
  event.preventDefault();
}

/**
 * Turns one page. `toBottom` lands on the bottom of the new page — for going
 * back by wheel or ↑, which continues reading upwards rather than jumping to
 * the top of the previous page (and straight past it on the next push).
 */
function turnPage(engine: ReaderEngine, container: HTMLElement, forward: boolean, options?: { toBottom?: boolean }) {
  const before = engine.currentPage;
  engine.goToPage(before + (forward ? 1 : -1));
  if (options?.toBottom && engine.currentPage !== before) container.scrollTop = container.scrollHeight;
}

/**
 * The previous / next page arrow beside the page. Shown on computers; on
 * phones it is there for screen readers only (they take over swipes and
 * taps). Never `disabled`: a disabled button drops the keyboard focus.
 */
function PageArrow({ side, disabled, onClick }: { side: "left" | "right"; disabled: boolean; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={() => !disabled && onClick()}
      onMouseDown={keepReadingFocus}
      aria-disabled={disabled}
      aria-label={side === "left" ? "Previous page" : "Next page"}
      title={side === "left" ? "Previous page" : "Next page"}
      className={cn(
        "absolute top-1/2 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border bg-card/90 text-muted-foreground shadow-sm transition-opacity hover:text-foreground max-md:sr-only",
        "opacity-40 hover:opacity-100 focus-visible:opacity-100 aria-disabled:pointer-events-none aria-disabled:opacity-0",
        side === "left" ? "left-3" : "right-3",
      )}
    >
      <Icon className="size-5" />
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
