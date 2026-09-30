"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  GripVertical,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Star,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/admin/status-badge";
import { adminApi } from "@/lib/api/admin";
import type { ProductListItem } from "@/lib/api/types";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Curating the landing page's featured strip.
 *
 * The screen is a single ordered list plus a picker, and the list *is* the
 * setting: there is no separate "how many to show" number anywhere, because
 * the count is however many rows are here. A number that could disagree with
 * the list would need a rule for what happens when it does, and every such
 * rule surprises someone.
 *
 * Nothing saves on its own. Reordering by drag is easy to do by accident, and
 * a strip that rearranged itself on the live site mid-gesture would be a
 * frightening thing to own — so edits are local until Save, and leaving with
 * unsaved work is called out rather than silently discarded.
 */
export default function AdminFeaturedPage() {
  const [featured, setFeatured] = useState<ProductListItem[]>([]);
  const [saved, setSaved] = useState<string[]>([]);
  const [candidates, setCandidates] = useState<ProductListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");

  const dragFrom = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  // Mount-only: everything after this is edited locally and saved explicitly,
  // so there is nothing to refetch until the page is reopened.
  useEffect(() => {
    void (async () => {
      try {
        // The candidate pool is every published product; the ones already
        // featured are filtered out below rather than in a second request, so
        // adding and removing needs no refetch.
        const [current, published] = await Promise.all([
          adminApi.listFeatured(),
          adminApi.listProducts({ status: "PUBLISHED" }),
        ]);
        setFeatured(current);
        setSaved(current.map((product) => product.id));
        setCandidates(published.items);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not load featured resources");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const ids = useMemo(() => featured.map((product) => product.id), [featured]);
  const dirty = useMemo(
    () => ids.length !== saved.length || ids.some((id, index) => id !== saved[index]),
    [ids, saved],
  );

  // Warn on tab close, but only while there is something to lose. The browser
  // shows its own generic message; the string is required, never displayed.
  useEffect(() => {
    if (!dirty) return;

    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const addable = useMemo(() => {
    const featuredIds = new Set(ids);
    const needle = query.trim().toLowerCase();

    return candidates.filter(
      (product) =>
        !featuredIds.has(product.id) &&
        (!needle || product.title.toLowerCase().includes(needle)),
    );
  }, [candidates, ids, query]);

  function move(from: number, to: number) {
    if (to < 0 || to >= featured.length || from === to) return;

    setFeatured((current) => {
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    try {
      const result = await adminApi.setFeatured(ids);
      setFeatured(result);
      setSaved(result.map((product) => product.id));
      toast.success(
        result.length === 0
          ? "Featured section cleared — the landing page will hide it"
          : `Saved — ${result.length} featured on the landing page`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  const hidden = featured.filter((product) => product.status !== "PUBLISHED").length;

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Featured resources</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            What appears in the Featured resources strip on the landing page, in this order.
            However many you put here is how many show — there is no separate limit.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {dirty && <span className="text-sm text-muted-foreground">Unsaved changes</span>}
          <Button onClick={() => void save()} disabled={!dirty || saving}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            Save
          </Button>
        </div>
      </div>

      {hidden > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/40">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-amber-900 dark:text-amber-200">
            {hidden === 1 ? "One resource here is" : `${hidden} resources here are`} not
            published, so {hidden === 1 ? "it does" : "they do"} not appear on the landing
            page. {hidden === 1 ? "Its" : "Their"} place is kept — publishing{" "}
            {hidden === 1 ? "it" : "them"} puts {hidden === 1 ? "it" : "them"} straight back.
          </p>
        </div>
      )}

      {/* --- The arranged list ------------------------------------------- */}
      {featured.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Sparkles className="size-8 text-muted-foreground" />
            <div>
              <p className="font-medium">Nothing is featured</p>
              <p className="text-sm text-muted-foreground">
                The landing page hides the Featured resources section entirely. Add a resource
                below to bring it back.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {featured.map((product, index) => (
            <li
              key={product.id}
              draggable
              onDragStart={() => {
                dragFrom.current = index;
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOver(index);
              }}
              onDragLeave={() => setDragOver((current) => (current === index ? null : current))}
              onDrop={(event) => {
                event.preventDefault();
                if (dragFrom.current !== null) move(dragFrom.current, index);
                dragFrom.current = null;
                setDragOver(null);
              }}
              onDragEnd={() => {
                dragFrom.current = null;
                setDragOver(null);
              }}
              className={cn(
                "flex items-center gap-3 rounded-lg border bg-card p-3 transition-colors",
                dragOver === index && "border-primary bg-primary/5",
                product.status !== "PUBLISHED" && "opacity-70",
              )}
            >
              <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing" />

              <span className="w-6 shrink-0 text-center text-sm font-semibold tabular-nums text-muted-foreground">
                {index + 1}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/admin/products/${product.id}`}
                    className="truncate font-medium hover:underline"
                  >
                    {product.title}
                  </Link>
                  {/* The landing page renders the first one as a wide card
                      above the rest, so which row is first is a layout
                      decision, not just an ordering one. */}
                  {index === 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                      <Star className="size-3" />
                      Main card
                    </span>
                  )}
                  {product.status !== "PUBLISHED" && <StatusBadge status={product.status} />}
                </div>
                <p className="truncate text-sm text-muted-foreground">
                  {product.accessType === "FREE"
                    ? "Free"
                    : formatMoney(product.priceAmountMinor, product.currency)}
                  {product.subtitle ? ` · ${product.subtitle}` : ""}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => move(index, index - 1)}
                  disabled={index === 0}
                  aria-label={`Move ${product.title} up`}
                >
                  <ArrowUp className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => move(index, index + 1)}
                  disabled={index === featured.length - 1}
                  aria-label={`Move ${product.title} down`}
                >
                  <ArrowDown className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    setFeatured((current) => current.filter((item) => item.id !== product.id))
                  }
                  aria-label={`Remove ${product.title} from featured`}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* --- The picker --------------------------------------------------- */}
      <div className="space-y-3 border-t pt-6">
        <div>
          <h2 className="font-medium">Add a resource</h2>
          <p className="text-sm text-muted-foreground">
            Only published resources can be featured.
          </p>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search published resources…"
            className="pl-9"
          />
        </div>

        {addable.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {query
              ? "No published resource matches that."
              : candidates.length === 0
                ? "Nothing is published yet."
                : "Everything published is already featured."}
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {addable.map((product) => (
              <li key={product.id} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{product.title}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {product.accessType === "FREE"
                      ? "Free"
                      : formatMoney(product.priceAmountMinor, product.currency)}
                    {product.subtitle ? ` · ${product.subtitle}` : ""}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setFeatured((current) => [...current, product])}
                >
                  <Plus className="size-4" />
                  Add
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
