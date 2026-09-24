"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Download, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { DoctorPortrait } from "@/components/store/doctor-portrait";
import { LinksSection } from "@/components/store/links-section";
import { TermGroups } from "@/components/store/term-groups";
import { ApiError } from "@/lib/api/client";
import { storeApi } from "@/lib/api/store";
import type { ProductDetail } from "@/lib/api/types";
import { formatBytes, formatMoney } from "@/lib/money";
import { author } from "@/lib/site-content";
import { useCheckout } from "@/lib/use-checkout";
import { useSessionStore } from "@/store/session-store";

function ProductPageContent() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, ready } = useSessionStore();

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [owned, setOwned] = useState(false);
  const [ownershipChecked, setOwnershipChecked] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const { buy, busy } = useCheckout({ onSettled: () => setOwned(true) });

  useEffect(() => {
    storeApi
      .product(params.slug)
      .then(setProduct)
      .catch(() => setNotFound(true));
  }, [params.slug]);

  // Ownership decides whether this page offers "Buy" or "Download", so it is
  // re-checked whenever the signed-in user changes.
  useEffect(() => {
    if (!ready || !user || !product) return;

    storeApi
      .purchases()
      .then((entitlements) => setOwned(entitlements.some((e) => e.productId === product.id)))
      .catch(() => setOwned(false))
      .finally(() => setOwnershipChecked(true));
  }, [ready, user, product]);

  // "Sign in to buy" appends `?buy=1` to the product URL it sends the buyer
  // back to after sign-in, so the round trip through /account/login ends with
  // checkout actually opening rather than the buyer having to find and press
  // the same button a second time. Waits on `ownershipChecked` specifically —
  // not just `ready` — because opening checkout for someone who, on another
  // device, already bought this would charge them twice.
  const autoBuyTriggered = useRef(false);
  useEffect(() => {
    if (autoBuyTriggered.current) return;
    if (searchParams.get("buy") !== "1") return;
    if (!ready || !user || !product || !ownershipChecked || owned) return;

    autoBuyTriggered.current = true;
    router.replace(`/p/${product.slug}`);
    void buy(product.id, product.title, { email: user.email, name: user.name });
  }, [searchParams, ready, user, product, ownershipChecked, owned, buy, router]);

  async function download() {
    if (!product) return;

    setDownloading(true);
    try {
      const { url } = await storeApi.downloadUrl(product.id);
      // The signed URL points straight at storage, so the file never streams
      // through this app.
      window.location.href = url;
    } catch (error) {
      toast.error(
        error instanceof ApiError && error.status === 401
          ? "Sign in to download this."
          : error instanceof Error
            ? error.message
            : "Could not start the download",
      );
    } finally {
      setDownloading(false);
    }
  }

  if (notFound) {
    return (
      <div className="py-24 text-center">
        <h1 className="text-xl font-semibold">Resource not found</h1>
        <p className="mt-1 text-muted-foreground">
          It may have been unpublished, or the link may be wrong.
        </p>
        <Link href="/browse" className={buttonVariants({ variant: "link" })}>
          Browse all resources
        </Link>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isFree = product.accessType === "FREE";
  const primary = product.assets.find((asset) => asset.kind === "PRIMARY_FILE");
  const canDownload = isFree || owned;
  const hasLinks = product.links.length > 0;

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{product.title}</h1>
          {product.subtitle && (
            <p className="mt-2 text-lg text-muted-foreground">{product.subtitle}</p>
          )}
          <p className="mt-2 text-sm text-muted-foreground">by {author.name}</p>
        </div>

        <TermGroups assignments={product.taxonomyTerms} />

        {product.description && (
          <div className="whitespace-pre-wrap text-[15px] leading-relaxed">
            {product.description}
          </div>
        )}

        {hasLinks && <LinksSection links={product.links} />}

        <Separator />

        <section className="flex gap-4">
          <DoctorPortrait size="compact" className="w-20 shrink-0" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">About the author</p>
            <p className="font-semibold tracking-tight">{author.name}</p>
            <p className="text-sm text-muted-foreground">{author.qualification}</p>
            <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1">
              {author.credentials.map((credential) => (
                <span key={credential} className="text-xs text-muted-foreground">
                  {credential}
                </span>
              ))}
            </div>
          </div>
        </section>
      </div>

      <div className="lg:sticky lg:top-20 lg:self-start">
        <Card className="overflow-hidden">
          {/* Only when there is one. An empty placeholder box here would be a
              larger, more prominent nothing than the card without it — on a
              listing the placeholder keeps a grid of cards aligned, but this
              card stands alone and has nothing to align to. */}
          {product.coverUrl && (
            <div className="aspect-[4/3] overflow-hidden border-b border-border bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element -- see
                  resource-card.tsx: a storage URL, and object-contain so an
                  upload of any aspect ratio is shown whole rather than cropped. */}
              <img
                src={product.coverUrl}
                alt={`Cover of ${product.title}`}
                className="size-full object-contain"
              />
            </div>
          )}
          <CardContent className="space-y-4 pt-6">
            <div className="flex flex-wrap items-baseline gap-2">
              {isFree ? (
                <span className="text-2xl font-semibold">Free</span>
              ) : (
                <>
                  <span className="text-2xl font-semibold">
                    {formatMoney(product.priceAmountMinor, product.currency)}
                  </span>
                  {product.compareAtAmountMinor && (
                    <span className="text-muted-foreground line-through">
                      {formatMoney(product.compareAtAmountMinor, product.currency)}
                    </span>
                  )}
                </>
              )}
            </div>

            {owned && !isFree && (
              <Badge variant="secondary" className="w-full justify-center py-1">
                In your library
              </Badge>
            )}

            {canDownload ? (
              <Button className="w-full" onClick={download} disabled={downloading}>
                <Download className="size-4" />
                {downloading ? "Preparing…" : "Download PDF"}
              </Button>
            ) : !ready ? (
              <Button className="w-full" disabled>
                <Loader2 className="size-4 animate-spin" />
              </Button>
            ) : user ? (
              <Button
                className="w-full"
                disabled={busy}
                onClick={() => buy(product.id, product.title, { email: user.email, name: user.name })}
              >
                {busy ? "Opening checkout…" : "Buy now"}
              </Button>
            ) : (
              <>
                <Button
                  className="w-full"
                  onClick={() =>
                    router.push(
                      `/account/login?next=${encodeURIComponent(`/p/${product.slug}?buy=1`)}`,
                    )
                  }
                >
                  Sign in to buy
                </Button>
                {/* Someone who already bought this and came back on another
                    device would otherwise see only "Buy now" and reasonably
                    conclude they had to pay twice. */}
                <p className="text-center text-xs text-muted-foreground">
                  Already purchased? Sign in to access it.
                </p>
              </>
            )}

            {primary && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileText className="size-4" />
                PDF
                {primary.pageCount && ` · ${primary.pageCount} pages`}
                {primary.sizeBytes && ` · ${formatBytes(primary.sizeBytes)}`}
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Instant download after payment. Yours to keep — it is added straight to your library, so you can come back and re-download it any time without digging through email receipts.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/**
 * The storefront shell's <main> is full-bleed so the landing page's hero can
 * paint its own background band edge to edge. Pages that are just content
 * bring their own container; this is the one the designed pages use.
 */
export default function ProductPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-5 py-10 lg:px-8">
      {/* useSearchParams (for the post-sign-in `?buy=1` auto-checkout) opts this
          page out of static rendering unless it is inside a Suspense boundary. */}
      <Suspense fallback={<Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />}>
        <ProductPageContent />
      </Suspense>
    </div>
  );
}
