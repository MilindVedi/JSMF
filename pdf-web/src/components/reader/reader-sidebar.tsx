"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { OutlineItem, ReaderEngine } from "@/lib/reader/types";
import { cn } from "@/lib/utils";

const THUMB_WIDTH = 112;

export type SidebarTab = "pages" | "contents";

/**
 * The side panel: a strip of page pictures, and the PDF's own table of
 * contents when it has one. Pictures are drawn only as they scroll into view,
 * one at a time, and kept as small images, so a 400-page book costs no more to
 * open than a 4-page one.
 *
 * The open tab belongs to the reader (`tab`), so closing and reopening the
 * panel keeps it. Until the reader picks one (null), a book with chapters
 * opens on them: that is what people look for.
 */
export function ReaderSidebar({
  engine,
  currentPage,
  tab,
  onTabChange,
  onNavigate,
}: {
  engine: ReaderEngine;
  currentPage: number;
  tab: SidebarTab | null;
  onTabChange: (tab: SidebarTab) => void;
  /** After a jump, so a phone can close the panel. */
  onNavigate: () => void;
}) {
  const [outline, setOutline] = useState<OutlineItem[] | null>(null);
  const shown: SidebarTab = tab ?? (outline && outline.length > 0 ? "contents" : "pages");

  useEffect(() => {
    let cancelled = false;
    engine
      .outline()
      .then((items) => !cancelled && setOutline(items))
      .catch(() => !cancelled && setOutline([]));
    return () => {
      cancelled = true;
    };
  }, [engine]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 gap-1 border-b p-2" role="tablist" aria-label="Side panel">
        {(["pages", "contents"] as const).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`reader-tab-${key}`}
            aria-controls="reader-tabpanel"
            aria-selected={shown === key}
            onClick={() => onTabChange(key)}
            className={cn(
              "flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
              shown === key ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {key === "pages" ? "Pages" : "Contents"}
          </button>
        ))}
      </div>

      <div
        id="reader-tabpanel"
        role="tabpanel"
        aria-labelledby={`reader-tab-${shown}`}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        {shown === "pages" ? (
          <Thumbnails engine={engine} currentPage={currentPage} onNavigate={onNavigate} />
        ) : outline === null ? (
          <p className="p-4 text-sm text-muted-foreground">Loading…</p>
        ) : outline.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">This PDF has no table of contents. Use Pages to jump around.</p>
        ) : (
          <ul className="p-2 text-sm">
            {outline.map((item, index) => (
              <OutlineRow
                key={index}
                item={item}
                depth={0}
                onPick={(picked) => {
                  engine.goToOutline(picked);
                  onNavigate();
                }}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function OutlineRow({
  item,
  depth,
  onPick,
}: {
  item: OutlineItem;
  depth: number;
  onPick: (item: OutlineItem) => void;
}) {
  const [open, setOpen] = useState(depth === 0);
  const hasChildren = item.children.length > 0;
  return (
    <li>
      <div className="flex items-start" style={{ paddingLeft: depth * 12 }}>
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-label={open ? "Collapse" : "Expand"}
            aria-expanded={open}
            className="mt-1 rounded p-0.5 text-muted-foreground hover:text-foreground"
          >
            <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
          </button>
        ) : (
          <span className="w-[18px] shrink-0" />
        )}
        {item.target ? (
          <button
            type="button"
            onClick={() => onPick(item)}
            className="min-w-0 flex-1 rounded px-1.5 py-1 text-left leading-snug hover:bg-muted"
          >
            {item.title || "Untitled"}
          </button>
        ) : (
          // A heading that goes nowhere in the PDF: shown, not clickable.
          <span className="min-w-0 flex-1 px-1.5 py-1 leading-snug text-muted-foreground">{item.title || "Untitled"}</span>
        )}
      </div>
      {hasChildren && open && (
        <ul>
          {item.children.map((child, index) => (
            <OutlineRow key={index} item={child} depth={depth + 1} onPick={onPick} />
          ))}
        </ul>
      )}
    </li>
  );
}

function Thumbnails({
  engine,
  currentPage,
  onNavigate,
}: {
  engine: ReaderEngine;
  currentPage: number;
  onNavigate: () => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const pages = Array.from({ length: engine.pageCount }, (_, index) => index + 1);

  // Keep the current page's picture in view as the reader moves through the book.
  useEffect(() => {
    const element = listRef.current?.querySelector<HTMLElement>(`[data-page="${currentPage}"]`);
    element?.scrollIntoView({ block: "nearest" });
  }, [currentPage]);

  return (
    <div ref={listRef} className="flex flex-col items-center gap-3 p-3">
      {pages.map((page) => (
        <Thumbnail
          key={page}
          engine={engine}
          page={page}
          active={page === currentPage}
          onPick={() => {
            engine.goToPage(page);
            onNavigate();
          }}
        />
      ))}
    </div>
  );
}

function Thumbnail({
  engine,
  page,
  active,
  onPick,
}: {
  engine: ReaderEngine;
  page: number;
  active: boolean;
  onPick: () => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [image, setImage] = useState<string | null>(null);

  // Asked for when it comes near the screen; given up if it scrolls away (or
  // the panel closes) before its turn in the engine's queue.
  useEffect(() => {
    const button = buttonRef.current;
    if (!button || image) return;
    let pending: AbortController | null = null;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((entry) => entry.isIntersecting);
        if (!visible) {
          pending?.abort();
          pending = null;
          return;
        }
        if (pending) return;
        const request = new AbortController();
        pending = request;
        engine
          .renderThumbnail(page, THUMB_WIDTH, request.signal)
          .then((blob) => {
            if (blob && !request.signal.aborted) setImage(URL.createObjectURL(blob));
          })
          .catch(() => undefined)
          .finally(() => {
            if (pending === request) pending = null;
          });
      },
      { rootMargin: "200px" },
    );
    observer.observe(button);
    return () => {
      observer.disconnect();
      pending?.abort();
    };
  }, [engine, page, image]);

  // The picture is a blob in memory until the panel lets it go.
  useEffect(() => () => void (image && URL.revokeObjectURL(image)), [image]);

  return (
    <button
      ref={buttonRef}
      type="button"
      data-page={page}
      onClick={onPick}
      aria-label={`Page ${page}`}
      aria-current={active ? "page" : undefined}
      className="group flex flex-col items-center gap-1"
    >
      <span
        className={cn(
          "block overflow-hidden rounded-sm bg-(--reader-page) ring-1 ring-border transition-shadow",
          active ? "ring-2 ring-primary" : "group-hover:ring-foreground/30",
        )}
        style={{ width: THUMB_WIDTH, minHeight: image ? undefined : THUMB_WIDTH * 1.35 }}
      >
        {image && (
          // eslint-disable-next-line @next/next/no-img-element -- a local blob, not an optimisable asset
          <img src={image} alt="" width={THUMB_WIDTH} className="reader-page-image block h-auto w-full" />
        )}
      </span>
      <span className={cn("text-[11px] tabular-nums", active ? "font-medium text-foreground" : "text-muted-foreground")}>
        {page}
      </span>
    </button>
  );
}
