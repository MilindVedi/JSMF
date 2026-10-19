"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, Download, FileText, Layers, Library, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AddMobileCard } from "@/components/store/add-mobile-card";
import { storeApi, type Entitlement } from "@/lib/api/store";
import { useSessionStore } from "@/store/session-store";

function LibraryContent() {
  const { user, ready } = useSessionStore();
  const [items, setItems] = useState<Entitlement[] | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  /** Bundle cards the reader has opened. */
  const [open, setOpen] = useState<Set<string>>(new Set());

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

  async function download(productId: string) {
    setDownloading(productId);
    try {
      const { url } = await storeApi.downloadUrl(productId);
      window.location.href = url;
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
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">My Library</h1>
        <p className="mt-1 text-muted-foreground">Everything you have access to.</p>
      </div>

      <AddMobileCard />

      {items === null ? (
        <div className="flex justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-20 text-center">
          <Library className="size-8 text-muted-foreground" />
          <p className="font-medium">Nothing here yet</p>
          <Link href="/browse" className={buttonVariants({ variant: "link" })}>
            Browse resources
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((entitlement) => (
            <Card key={entitlement.id}>
              <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  {entitlement.product.listed ? (
                    <Link
                      href={`/p/${entitlement.product.slug}`}
                      className="font-medium hover:underline"
                    >
                      {entitlement.product.title}
                    </Link>
                  ) : (
                    // Hidden from the store: there is no product page to open.
                    <p className="font-medium">{entitlement.product.title}</p>
                  )}
                  {entitlement.product.subtitle && (
                    <p className="truncate text-sm text-muted-foreground">
                      {entitlement.product.subtitle}
                    </p>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {entitlement.contents && (
                      <Badge variant="secondary" className="gap-1 text-xs">
                        <Layers className="size-3" />
                        Bundle · {entitlement.contents.length} PDF{entitlement.contents.length === 1 ? "" : "s"}
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-xs">
                      {entitlement.source === "FREE_CLAIM"
                        ? "Free"
                        : entitlement.source === "SESSION_MATERIAL"
                          ? "Session material"
                          : entitlement.source === "BUNDLE" && entitlement.sourceProduct?.type === "LIVE_SESSION"
                            ? "Included with your seat"
                            : "Purchased"}
                    </Badge>
                    {(entitlement.source === "SESSION_MATERIAL" ||
                      (entitlement.source === "BUNDLE" && entitlement.sourceProduct?.type === "LIVE_SESSION")) &&
                      entitlement.sourceProduct && (
                        <span className="text-xs text-muted-foreground">{entitlement.sourceProduct.title}</span>
                      )}
                    <span className="text-xs text-muted-foreground">
                      {new Date(entitlement.grantedAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                </div>

                {entitlement.contents ? (
                  // A bundle has no file of its own: it opens to its PDFs.
                  <Button
                    className="shrink-0"
                    variant="outline"
                    aria-expanded={open.has(entitlement.id)}
                    onClick={() =>
                      setOpen((current) => {
                        const next = new Set(current);
                        if (next.has(entitlement.id)) next.delete(entitlement.id);
                        else next.add(entitlement.id);
                        return next;
                      })
                    }
                  >
                    {open.has(entitlement.id) ? "Hide PDFs" : `Show ${entitlement.contents.length} PDFs`}
                    <ChevronDown
                      className={`size-4 transition-transform ${open.has(entitlement.id) ? "rotate-180" : ""}`}
                    />
                  </Button>
                ) : (
                  <Button
                    className="shrink-0"
                    variant="outline"
                    disabled={downloading === entitlement.productId}
                    onClick={() => download(entitlement.productId)}
                  >
                    <Download className="size-4" />
                    {downloading === entitlement.productId ? "Preparing…" : "Download"}
                  </Button>
                )}
              </CardContent>
              {entitlement.contents && open.has(entitlement.id) && (
                <ul className="divide-y border-t">
                  {entitlement.contents.length === 0 ? (
                    <li className="px-6 py-3 text-sm text-muted-foreground">No PDFs in this bundle are available yet.</li>
                  ) : (
                    entitlement.contents.map((item) => (
                      <li
                        key={item.id}
                        className="flex flex-col gap-2 px-6 py-3 sm:flex-row sm:items-center sm:justify-between"
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
                          variant="outline"
                          className="shrink-0"
                          disabled={downloading === item.id}
                          onClick={() => download(item.id)}
                        >
                          <Download className="size-4" />
                          {downloading === item.id ? "Preparing…" : "Download"}
                        </Button>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The storefront shell's <main> is full-bleed so the landing page's hero can
 * paint its own background band edge to edge. Pages that are just content
 * bring their own container; this is the one the designed pages use.
 */
export default function LibraryPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-5 py-10 lg:px-8">
      <LibraryContent />
    </div>
  );
}
