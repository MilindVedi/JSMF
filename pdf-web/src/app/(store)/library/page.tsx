"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Bookmark,
  Check,
  ChevronDown,
  Download,
  FileText,
  Layers,
  LayoutGrid,
  Library,
  List,
  Loader2,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { AddMobileCard } from "@/components/store/add-mobile-card";
import { storeApi, type Entitlement } from "@/lib/api/store";
import { buildIndex, search } from "@/lib/library-search";
import { author, brand, supportEmail } from "@/lib/site-content";
import { useSessionStore } from "@/store/session-store";

type View = "list" | "grid";
type Filter = "all" | "bookmarked";

/** Which view this reader last picked. Per browser: a preference, not data. */
const VIEW_KEY = "jsmf.library.view";

/** How this reader came by it — the small badge at the top of the card. */
function sourceLabel(entitlement: Entitlement): string {
  if (entitlement.source === "FREE_CLAIM") return "Free";
  if (entitlement.source === "SESSION_MATERIAL") return "Session material";
  if (entitlement.source === "BUNDLE" && entitlement.sourceProduct?.type === "LIVE_SESSION") {
    return "Included with your seat";
  }
  return "Purchased";
}

const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

function LibraryContent() {
  const { user, ready } = useSessionStore();
  const [items, setItems] = useState<Entitlement[] | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  /** Bundle cards the reader has opened. */
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [view, setView] = useState<View>("list");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  /** Bookmarks being saved, so a double tap cannot send two requests. */
  const [saving, setSaving] = useState<Set<string>>(new Set());

  // Read after the first paint, so the server's render and the first client
  // render agree.
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const saved = window.localStorage.getItem(VIEW_KEY);
        if (saved === "grid" || saved === "list") setView(saved);
      } catch {
        // Storage switched off: the list view, as for anyone new.
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function pickView(next: View) {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Not remembered next time; nothing else is lost.
    }
  }

  useEffect(() => {
    if (!ready || !user) return;

    storeApi
      .purchases()
      .then(setItems)
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : "Could not load your library");
        setItems([]);
      });
  }, [ready, user]);

  const bookmarkedCount = items?.filter((entitlement) => entitlement.bookmarked).length ?? 0;

  // In the browser, not the server — see lib/library-search.ts for why. The
  // index is rebuilt only when the list changes, not on every keystroke.
  const index = useMemo(
    () =>
      buildIndex(items ?? [], (entitlement) => ({
        title: entitlement.product.title,
        subtitle: entitlement.product.subtitle,
        contents: entitlement.contents?.map((item) => item.title),
        session: entitlement.sourceProduct?.title,
        label: sourceLabel(entitlement),
      })),
    [items],
  );
  const shown = useMemo(
    () => search(index, query).filter((entitlement) => filter === "all" || entitlement.bookmarked),
    [index, query, filter],
  );

  /**
   * Shown at once and saved behind it; put back, with a message, if the save
   * fails — a bookmark that quietly did not stick is worse than none.
   */
  async function toggleBookmark(entitlement: Entitlement) {
    const productId = entitlement.productId;
    if (saving.has(productId)) return;
    const next = !entitlement.bookmarked;
    const flip = (value: boolean) =>
      setItems((current) =>
        current?.map((row) => (row.productId === productId ? { ...row, bookmarked: value } : row)) ?? current,
      );

    flip(next);
    setSaving((current) => new Set(current).add(productId));
    try {
      if (next) await storeApi.bookmark(productId);
      else await storeApi.unbookmark(productId);
    } catch (error) {
      flip(!next);
      toast.error(error instanceof Error ? error.message : "Could not save your bookmark");
    } finally {
      setSaving((current) => {
        const rest = new Set(current);
        rest.delete(productId);
        return rest;
      });
    }
  }

  const bundles = items?.filter((entitlement) => entitlement.contents !== null).length ?? 0;
  const files = (items?.length ?? 0) - bundles;

  async function download(productId: string) {
    setDownloading(productId);
    try {
      const { url } = await storeApi.downloadUrl(productId);
      window.location.assign(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start the download");
    } finally {
      setDownloading(null);
    }
  }

  if (!ready) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-center">
        <Library className="size-8 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Your library</h1>
        <p className="max-w-sm text-muted-foreground">
          Sign in to see everything you have bought or claimed. Downloads are always available —
          what you buy is yours to keep.
        </p>
        <Link href="/account/login?next=%2Flibrary" className={buttonVariants()}>
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <>
      <section className="library-intro border-b border-border">
        <div className="mx-auto max-w-7xl px-5 py-10 lg:px-8 lg:py-14">
          <p className="library-enter flex items-center gap-2 text-xs font-semibold uppercase text-primary">
            <Library size={15} /> Your personal study space
          </p>

          <div className="mt-5 flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
            <div>
              <h1 className="font-display text-4xl font-semibold text-brand-deep sm:text-5xl">
                My Library<span className="text-primary">.</span>
              </h1>
              <p className="mt-4 text-sm text-muted-foreground sm:text-base">
                Good notes. Clear concepts. All in one place.
              </p>
            </div>
            <Link href="/browse" className={buttonVariants({ variant: "secondary" })}>
              Explore resources <ArrowRight size={16} />
            </Link>
          </div>

          {/* Counted from what is actually here, so the line can never claim a
              resource this reader does not hold. */}
          {items !== null && items.length > 0 && (
            <div className="mt-8 flex flex-wrap items-center gap-x-7 gap-y-3 border-t border-border pt-5 text-xs text-muted-foreground">
              <span className="flex items-center gap-2">
                <BookOpen size={16} className="text-primary" />
                <strong className="text-foreground">{items.length}</strong>
                {items.length === 1 ? "resource" : "resources"}
              </span>
              {files > 0 && (
                <span className="flex items-center gap-2">
                  <FileText size={16} className="text-primary" /> {files} PDF{files === 1 ? "" : "s"}
                </span>
              )}
              {bundles > 0 && (
                <span className="flex items-center gap-2">
                  <Layers size={16} className="text-primary" /> {bundles} bundle{bundles === 1 ? "" : "s"}
                </span>
              )}
              <span className="flex items-center gap-2">
                <ShieldCheck size={16} className="text-primary" /> Doctor-led material
              </span>
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-8 lg:px-8 lg:py-10">
        <AddMobileCard />

        {items === null ? (
          <div className="flex justify-center py-20">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <div className="library-enter flex min-h-80 flex-col items-center justify-center text-center">
            <span className="grid size-14 place-items-center rounded-full bg-accent text-primary">
              <BookOpen size={25} />
            </span>
            <h2 className="mt-5 font-display text-lg font-semibold text-brand-deep">Nothing here yet</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Anything you buy or claim lands here, and stays yours to download.
            </p>
            <Link href="/browse" className={`${buttonVariants({ variant: "link" })} mt-3`}>
              Browse resources <ArrowRight size={15} />
            </Link>
          </div>
        ) : (
          <>
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div className="flex items-center gap-1" role="group" aria-label="Library filters">
                <Button
                  size="sm"
                  variant={filter === "all" ? "secondary" : "ghost"}
                  aria-pressed={filter === "all"}
                  onClick={() => setFilter("all")}
                >
                  All resources <span className="text-muted-foreground">{items.length}</span>
                </Button>
                <Button
                  size="sm"
                  variant={filter === "bookmarked" ? "secondary" : "ghost"}
                  aria-pressed={filter === "bookmarked"}
                  onClick={() => setFilter("bookmarked")}
                >
                  <Bookmark size={14} /> Bookmarked{" "}
                  <span className="text-muted-foreground">{bookmarkedCount}</span>
                </Button>
              </div>

              <div className="flex items-center gap-3">
                <div className="relative min-w-0 flex-1 sm:w-60 sm:flex-none">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    size={16}
                  />
                  <input
                    aria-label="Search your library"
                    placeholder="Search your library"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    className="field h-11 pl-9 pr-9"
                  />
                  {query && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Clear search"
                      className="absolute right-0 top-0"
                      onClick={() => setQuery("")}
                    >
                      <X size={14} />
                    </Button>
                  )}
                </div>

                <div className="flex shrink-0 rounded-lg border border-border bg-card p-1">
                  <Button
                    size="icon"
                    variant={view === "list" ? "secondary" : "ghost"}
                    className="size-8 min-h-8 rounded-md"
                    title="List view"
                    aria-label="List view"
                    aria-pressed={view === "list"}
                    onClick={() => pickView("list")}
                  >
                    <List size={17} />
                  </Button>
                  <Button
                    size="icon"
                    variant={view === "grid" ? "secondary" : "ghost"}
                    className="size-8 min-h-8 rounded-md"
                    title="Grid view"
                    aria-label="Grid view"
                    aria-pressed={view === "grid"}
                    onClick={() => pickView("grid")}
                  >
                    <LayoutGrid size={16} />
                  </Button>
                </div>
              </div>
            </div>

            <div className="mt-7 flex items-center justify-between text-xs text-muted-foreground">
              <h2 className="font-semibold text-foreground">Your collection</h2>
              <span>
                {shown.length} {shown.length === 1 ? "resource" : "resources"}
              </span>
            </div>

            {shown.length === 0 ? (
              <div className="library-enter flex min-h-80 flex-col items-center justify-center text-center">
                <span className="grid size-14 place-items-center rounded-full bg-accent text-primary">
                  <BookOpen size={25} />
                </span>
                <h3 className="mt-5 font-display text-lg font-semibold text-brand-deep">
                  {filter === "bookmarked" && bookmarkedCount === 0
                    ? "No bookmarks yet"
                    : "No matching resources"}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {filter === "bookmarked" && bookmarkedCount === 0
                    ? "Tap the bookmark on any resource to keep it here."
                    : "Try another title, or clear your search."}
                </p>
                <Button
                  variant="link"
                  className="mt-3"
                  onClick={() => {
                    setQuery("");
                    setFilter("all");
                  }}
                >
                  Back to all resources <ArrowRight size={15} />
                </Button>
              </div>
            ) : (
              <div
                className={`mt-4 ${
                  view === "grid" ? "grid gap-6 sm:grid-cols-2 lg:grid-cols-3" : "space-y-4"
                }`}
              >
                {shown.map((entitlement) => (
                  <ResourceCard
                    // Re-mounted on a view change so the reveal plays again.
                    key={`${view}-${entitlement.id}`}
                    entitlement={entitlement}
                    view={view}
                    downloading={downloading}
                    onDownload={download}
                    isOpen={open.has(entitlement.id)}
                    savingBookmark={saving.has(entitlement.productId)}
                    onBookmark={() => void toggleBookmark(entitlement)}
                    onToggle={() =>
                      setOpen((current) => {
                        const next = new Set(current);
                        if (next.has(entitlement.id)) next.delete(entitlement.id);
                        else next.add(entitlement.id);
                        return next;
                      })
                    }
                  />
                ))}
              </div>
            )}

            <div className="mt-9 flex flex-col justify-between gap-3 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row">
              <span className="flex items-center gap-2">
                <ShieldCheck size={14} className="text-primary" /> Curated by {author.name}
              </span>
              <a
                href={`mailto:${supportEmail}`}
                className="font-semibold text-primary hover:underline"
              >
                Need help with a resource?
              </a>
            </div>
          </>
        )}
      </section>
    </>
  );
}

function ResourceCard({
  entitlement,
  view,
  downloading,
  isOpen,
  savingBookmark,
  onDownload,
  onToggle,
  onBookmark,
}: {
  entitlement: Entitlement;
  view: View;
  downloading: string | null;
  isOpen: boolean;
  savingBookmark: boolean;
  onDownload: (productId: string) => void;
  onToggle: () => void;
  onBookmark: () => void;
}) {
  const { product, contents } = entitlement;
  const bundle = contents !== null;
  const list = view === "list";

  return (
    <article
      className={`library-enter library-resource group overflow-hidden rounded-lg border border-border bg-card ${
        list ? "sm:flex sm:flex-row" : ""
      }`}
    >
      <div
        className={`library-cover-stage relative flex shrink-0 items-center justify-center bg-secondary ${
          list ? "min-h-64 px-10 py-8 sm:w-64 sm:px-12 lg:w-72" : "h-64 p-8"
        }`}
      >
        {product.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- a signed storage URL
          <img
            src={product.coverUrl}
            alt={`${product.title} cover`}
            width={768}
            height={1024}
            className="library-book h-48 w-auto max-w-full rounded-sm object-cover transition-transform duration-500 group-hover:-rotate-2 group-hover:scale-[1.04]"
          />
        ) : (
          // No cover was uploaded: a plain mark, not a stand-in picture.
          <span className="library-book grid h-48 w-36 place-items-center rounded-sm bg-card text-primary">
            {bundle ? <Layers size={28} /> : <FileText size={28} />}
          </span>
        )}
        <span className="absolute bottom-3 left-4 flex items-center gap-1 text-[10px] font-semibold uppercase text-primary">
          {bundle ? (
            <>
              <Layers size={11} /> {contents.length} PDF{contents.length === 1 ? "" : "s"}
            </>
          ) : (
            <>
              <FileText size={11} /> PDF
            </>
          )}
        </span>
      </div>

      <div className={`flex min-w-0 flex-1 flex-col ${list ? "p-6 lg:p-8" : "p-5"}`}>
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 text-[10px] font-bold text-primary">
            <Check size={12} /> {sourceLabel(entitlement)}
          </span>
          <Button
            variant="ghost"
            size="icon"
            title={entitlement.bookmarked ? "Remove bookmark" : "Bookmark resource"}
            aria-label={entitlement.bookmarked ? "Remove bookmark" : "Bookmark resource"}
            aria-pressed={entitlement.bookmarked}
            disabled={savingBookmark}
            onClick={onBookmark}
          >
            <Bookmark
              size={18}
              fill={entitlement.bookmarked ? "currentColor" : "none"}
              className={entitlement.bookmarked ? "text-primary" : ""}
            />
          </Button>
        </div>

        {product.subtitle && (
          <span className="mt-4 text-[10px] font-bold uppercase text-primary">
            {brand.name} · {product.subtitle}
          </span>
        )}
        <h3
          className={`mt-2 font-display font-semibold leading-snug text-brand-deep ${
            list ? "text-2xl lg:text-3xl" : "text-xl"
          }`}
        >
          {product.listed ? (
            <Link href={`/p/${product.slug}`} className="hover:underline">
              {product.title}
            </Link>
          ) : (
            // Hidden from the store: there is no product page to open.
            product.title
          )}
          <span className="block text-base font-medium text-muted-foreground">by {brand.name}</span>
        </h3>

        <p className="mt-4 text-xs text-muted-foreground">
          Added to your library · {dateLabel(entitlement.grantedAt)}
          {entitlement.sourceProduct &&
            (entitlement.source === "SESSION_MATERIAL" ||
              (entitlement.source === "BUNDLE" &&
                entitlement.sourceProduct.type === "LIVE_SESSION")) && (
              <> · {entitlement.sourceProduct.title}</>
            )}
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-border pt-5 sm:mt-auto">
          {bundle ? (
            // A bundle has no file of its own: it opens to its PDFs.
            <Button variant="secondary" aria-expanded={isOpen} onClick={onToggle}>
              {isOpen ? "Hide PDFs" : `Show ${contents.length} PDF${contents.length === 1 ? "" : "s"}`}
              <ChevronDown className={`size-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </Button>
          ) : (
            <Button
              disabled={downloading === entitlement.productId}
              onClick={() => onDownload(entitlement.productId)}
            >
              <Download size={16} />
              {downloading === entitlement.productId ? "Preparing…" : "Download PDF"}
            </Button>
          )}
        </div>

        {bundle && isOpen && (
          <ul className="mt-4 divide-y border-t border-border">
            {contents.length === 0 ? (
              <li className="py-3 text-sm text-muted-foreground">
                No PDFs in this bundle are available yet.
              </li>
            ) : (
              contents.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-start gap-2">
                    <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{item.title}</p>
                      {item.subtitle && (
                        <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="shrink-0"
                    disabled={downloading === item.id}
                    onClick={() => onDownload(item.id)}
                  >
                    <Download size={15} />
                    {downloading === item.id ? "Preparing…" : "Download"}
                  </Button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    </article>
  );
}

/**
 * The reader's own shelf.
 *
 * Unlike the other content pages this one paints its own full-width intro
 * band, the way the landing page does, so it brings no outer container of its
 * own — each section inside carries the page's container instead.
 */
export default function LibraryPage() {
  return <LibraryContent />;
}
