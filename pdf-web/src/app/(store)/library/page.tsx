"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Download, Library, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { storeApi, type Entitlement } from "@/lib/api/store";
import { useSessionStore } from "@/store/session-store";

function LibraryContent() {
  const { user, ready } = useSessionStore();
  const [items, setItems] = useState<Entitlement[] | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

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
                  <Link
                    href={`/p/${entitlement.product.slug}`}
                    className="font-medium hover:underline"
                  >
                    {entitlement.product.title}
                  </Link>
                  {entitlement.product.subtitle && (
                    <p className="truncate text-sm text-muted-foreground">
                      {entitlement.product.subtitle}
                    </p>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {entitlement.source === "FREE_CLAIM" ? "Free" : "Purchased"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(entitlement.grantedAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                </div>

                <Button
                  className="shrink-0"
                  variant="outline"
                  disabled={downloading === entitlement.productId}
                  onClick={() => download(entitlement.productId)}
                >
                  <Download className="size-4" />
                  {downloading === entitlement.productId ? "Preparing…" : "Download"}
                </Button>
              </CardContent>
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
