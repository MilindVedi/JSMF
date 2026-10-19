"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, FileText, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { adminApi, type BundleContents } from "@/lib/api/admin";
import type { ProductListItem } from "@/lib/api/types";

/**
 * A bundle's PDFs. Unlike the rest of the editor, every change here saves at
 * once: there is no draft of a bundle's contents.
 *
 * Everyone who has the bundle has its current PDFs: an added one reaches them
 * at once, a removed one is taken back. Each PDF stays its own product: the
 * admin chooses, while adding it, whether it is also sold on its own.
 */
export function BundleContentsCard({
  productId,
  onCountChange,
}: {
  productId: string;
  onCountChange: (count: number) => void;
}) {
  const [contents, setContents] = useState<BundleContents | null>(null);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  // Tagged with the search they answer, so "No PDFs found" never shows mid-search.
  const [found, setFound] = useState<{ query: string; items: ProductListItem[] } | null>(null);
  const [picked, setPicked] = useState<ProductListItem | null>(null);
  // Whether the picked PDF is also sold on its own; starts as it is today.
  const [sellAlone, setSellAlone] = useState(false);
  const [busy, setBusy] = useState(false);

  const show = useCallback(
    (next: BundleContents) => {
      setContents(next);
      onCountChange(next.items.length);
    },
    [onCountChange],
  );

  useEffect(() => {
    adminApi
      .bundleItems(productId)
      .then(show)
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : "Could not load the bundle"));
  }, [productId, show]);

  useEffect(() => {
    if (!adding) return;
    const timer = setTimeout(() => {
      adminApi
        .listProducts({ type: "PDF", q: query.trim() || undefined })
        .then((page) => setFound({ query, items: page.items }))
        .catch(() => setFound({ query, items: [] }));
    }, 250);
    return () => clearTimeout(timer);
  }, [adding, query]);

  const results = found?.query === query ? found.items : null;
  const inBundle = new Set(contents?.items.map((item) => item.productId));

  async function run(action: () => Promise<BundleContents>, message: (result: BundleContents) => string) {
    setBusy(true);
    try {
      const result = await action();
      show(result);
      toast.success(message(result));
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not do that");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    if (!picked) return;
    const title = picked.title;
    const done = await run(
      () => adminApi.addBundleItem(productId, picked.id, sellAlone),
      (result) =>
        `Added "${title}"` +
        (result.given ? `, and gave it to ${result.given} ${result.given === 1 ? "person" : "people"}` : ""),
    );
    if (done) setPicked(null);
  }

  function move(index: number, by: -1 | 1) {
    if (!contents) return;
    const order = contents.items.map((item) => item.productId);
    const [moved] = order.splice(index, 1);
    order.splice(index + by, 0, moved);
    void run(() => adminApi.reorderBundle(productId, order), () => "Order saved");
  }

  if (!contents) {
    return (
      <Card>
        <CardContent className="flex justify-center py-10">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const holders = contents.holders;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          What&apos;s in this bundle · {contents.items.length} PDF{contents.items.length === 1 ? "" : "s"}
        </CardTitle>
        <CardDescription>
          PDFs sold together at the bundle&apos;s price. Each can also be sold on its own, or only in bundles. Changes
          here save at once, and everyone who has the bundle always has its current PDFs.
          {holders > 0 && ` ${holders} ${holders === 1 ? "person has" : "people have"} this bundle.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {contents.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No PDFs yet. Add at least one before publishing.</p>
        ) : (
          <ol className="space-y-2">
            {contents.items.map((item, index) => (
              <li key={item.productId} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                <div className="min-w-0">
                  <Link
                    href={`/admin/products/${item.productId}`}
                    className="flex items-center gap-1.5 text-sm font-medium hover:underline"
                  >
                    <FileText className="size-4 shrink-0" />
                    <span className="truncate">
                      {index + 1}. {item.title}
                    </span>
                  </Link>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <Badge variant="outline" className="text-xs">
                      {item.listed ? "Also sold on its own" : "Only in bundles"}
                    </Badge>
                    {item.pageCount !== null && (
                      <Badge variant="outline" className="text-xs">
                        {item.pageCount} pages
                      </Badge>
                    )}
                    {item.status !== "PUBLISHED" && (
                      <Badge variant="outline" className="text-xs">
                        {item.status.toLowerCase()}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Move ${item.title} up`}
                    disabled={busy || index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Move ${item.title} down`}
                    disabled={busy || index === contents.items.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Remove ${item.title}`}
                    disabled={busy}
                    onClick={() => {
                      if (
                        !window.confirm(
                          `Remove "${item.title}" from this bundle?\n\n` +
                            "Everyone who got it through this bundle loses it from their library (copies they already " +
                            "downloaded stay on their device). Anyone who bought it on its own keeps it.",
                        )
                      ) {
                        return;
                      }
                      void run(
                        () => adminApi.removeBundleItem(productId, item.productId),
                        (result) =>
                          `Removed "${item.title}"` +
                          (result.revoked ? ` and took it back from ${result.revoked} ${result.revoked === 1 ? "person" : "people"}` : ""),
                      );
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ol>
        )}

        {picked ? (
          <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
            <p className="text-sm">
              Add <span className="font-medium">&ldquo;{picked.title}&rdquo;</span> to this bundle?
            </p>
            <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
              {holders > 0 && (
                <li>
                  The {holders} {holders === 1 ? "person who has" : "people who have"} the bundle get it in their library
                  at once.
                </li>
              )}
            </ul>
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <Switch id="sell-alone" checked={sellAlone} onCheckedChange={setSellAlone} disabled={busy} />
                <Label htmlFor="sell-alone" className="text-sm font-medium">
                  Also sell it on its own
                </Label>
              </div>
              <p className="text-xs text-muted-foreground">
                {sellAlone
                  ? "It stays in the store at its own price, and the bundle page links to it."
                  : "Only in bundles: it is hidden from the store and can be had only through a bundle it is in. Anyone who already bought it on its own keeps it."}{" "}
                You can change this later in its Details (Show in store).
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={busy} onClick={() => void add()}>
                Add to bundle
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setPicked(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : adding ? (
          <div className="space-y-2">
            <Input
              autoFocus
              placeholder="Search PDFs in the store"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <ul className="max-h-64 space-y-1 overflow-y-auto">
              {results === null ? (
                <li className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" /> Searching…
                </li>
              ) : results.length === 0 ? (
                <li className="text-xs text-muted-foreground">
                  No PDFs found. Upload it in{" "}
                  <Link href="/admin/products/new" className="underline">
                    Products
                  </Link>{" "}
                  first.
                </li>
              ) : (
                results.map((product) => {
                  const hasFile = product.assets.some((asset) => asset.kind === "PRIMARY_FILE");
                  const already = inBundle.has(product.id);
                  return (
                    <li key={product.id}>
                      <button
                        type="button"
                        disabled={busy || already || !hasFile}
                        onClick={() => {
                          setPicked(product);
                          setSellAlone(product.listed);
                        }}
                        className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {product.title}
                        <span className="ml-2 text-xs text-muted-foreground">
                          {already ? "already in this bundle" : !hasFile ? "no file uploaded" : product.listed ? "in store" : "hidden"}
                        </span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setAdding(false);
                setQuery("");
              }}
            >
              Done
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="size-4" /> {contents.items.length > 0 ? "Add another PDF" : "Add a PDF"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
