"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { adminApi } from "@/lib/api/admin";
import type { ProductAsset, ProductDetail } from "@/lib/api/types";
import type { StorefrontProduct } from "@/lib/api/store";
import { ResourceCard } from "@/components/store/resource-card";
import { LinksSection } from "@/components/store/links-section";
import { formatBytes } from "@/lib/money";

/**
 * Asset preview URLs are signed and short-lived, so they are fetched on demand
 * and re-fetched whenever the asset changes rather than stored on the record.
 *
 * Returns `null` while loading and on failure alike: a preview the admin did
 * not ask for is not worth a toast, and every caller has a sensible fallback.
 */
export function useAssetPreviewUrl(assetId: string | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  // Clear the stale URL the instant the asset id changes, in the same render
  // rather than a follow-up effect, so nothing ever briefly shows a preview
  // for the wrong asset while the new fetch is still in flight.
  const [trackedAssetId, setTrackedAssetId] = useState(assetId);
  if (assetId !== trackedAssetId) {
    setTrackedAssetId(assetId);
    setUrl(null);
  }

  useEffect(() => {
    if (!assetId) return;
    let cancelled = false;
    adminApi
      .previewAssetUrl(assetId)
      .then((result) => {
        if (!cancelled) setUrl(result.url);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [assetId]);

  return url;
}

/**
 * The cover is the one asset whose content is legible at a glance, so it gets a
 * thumbnail rather than the filename-and-Open row the PDF versions use: seeing
 * the wrong image is how an admin notices a mistaken upload, and a filename
 * tells them nothing.
 */
export function CoverPreview({ asset, url }: { asset: ProductAsset; url: string | null }) {
  const [failed, setFailed] = useState(false);
  // Reset the failure flag as soon as a new URL arrives (asset replaced, or
  // the signed link refreshed) rather than in an effect: the state change and
  // the prop change that causes it happen in the same render.
  const [trackedUrl, setTrackedUrl] = useState(url);
  if (url !== trackedUrl) {
    setTrackedUrl(url);
    setFailed(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border px-3 py-2 text-sm">
      <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded border bg-muted">
        {url && !failed ? (
          // eslint-disable-next-line @next/next/no-img-element -- a signed,
          // expiring URL on an arbitrary host; next/image would need every
          // storage host in remotePatterns and would cache a URL that expires.
          <img
            src={url}
            alt=""
            className="size-full object-contain"
            onError={() => setFailed(true)}
          />
        ) : (
          <ImageIcon className="size-5 text-muted-foreground" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <span className="font-medium">v{asset.version}</span>
        <span className="ml-2 text-xs text-emerald-600 dark:text-emerald-400">current</span>
        <p className="truncate text-xs text-muted-foreground">
          {asset.originalFilename} · {formatBytes(asset.sizeBytes)}
        </p>
      </div>

      <Button
        size="sm"
        variant="ghost"
        disabled={!url}
        onClick={() => {
          if (url) window.open(url, "_blank", "noopener");
        }}
      >
        <ExternalLink className="size-4" />
        Open
      </Button>
    </div>
  );
}

/**
 * The real storefront card, rendered with this product's current draft values,
 * so the admin sees the thing a buyer will see instead of guessing how a title
 * wraps or whether the cover crops badly at 4:3.
 *
 * It deliberately reuses `ResourceCard` rather than reproducing it — a copy
 * would drift, and a preview that lies is worse than no preview. The card's
 * link is neutralised because a draft has no public page to open yet.
 */
export function StorefrontPreview({
  product,
  coverUrl,
  showLinks = false,
}: {
  product: ProductDetail;
  coverUrl: string | null;
  /**
   * Also renders the YouTube / related-links block exactly as it appears on
   * the product page — the Links step is the only place an admin is looking
   * at links, so that is where seeing them rendered actually helps. The card
   * itself never shows links; only the full product page does.
   */
  showLinks?: boolean;
}) {
  // ProductDetail carries every field a storefront card reads; only the signed
  // cover URL, which the public API resolves server-side, has to be supplied.
  const asStorefront = { ...product, coverUrl } as unknown as StorefrontProduct;

  return (
    <div className="space-y-4">
      <div className="pointer-events-none max-w-xs select-none" aria-hidden>
        <ResourceCard product={asStorefront} />
      </div>
      <p className="text-xs text-muted-foreground">
        {product.status === "PUBLISHED"
          ? "This is how the card looks on the landing page and in Browse."
          : "This is how the card will look once the product is published."}
      </p>

      {showLinks && product.links.length > 0 && (
        <div className="max-w-xs space-y-3 rounded-lg border bg-muted/30 px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground">
            On the product page
          </p>
          <LinksSection links={product.links} />
        </div>
      )}
    </div>
  );
}
