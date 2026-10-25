"use client";

import type { AuthUser } from "@/lib/api/types";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { BookOpenText, CheckCircle2, Download, Eye, FileText, Layers, Library, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { DoctorPortrait } from "@/components/store/doctor-portrait";
import { readHref } from "@/components/store/reading-progress";
import { LinksSection } from "@/components/store/links-section";
import { TermGroups } from "@/components/store/term-groups";
import { ApiError } from "@/lib/api/client";
import { storeApi, type BundleQuote } from "@/lib/api/store";
import { isDownloadAllowed, type ProductDetail } from "@/lib/api/types";
import { formatBytes, formatMoney } from "@/lib/money";
import { author } from "@/lib/site-content";
import { useCheckout } from "@/lib/use-checkout";
import { useStoreDownloadsEnabled } from "@/lib/use-platform-settings";
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
  const storeDownloads = useStoreDownloadsEnabled();
  /** A bundle's price for this buyer: the PDFs in it they already have come off. */
  const [quote, setQuote] = useState<BundleQuote | null>(null);

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

    const purchases = storeApi
      .purchases()
      .then((entitlements) => setOwned(entitlements.some((e) => e.productId === product.id)))
      .catch(() => setOwned(false));
    // Checkout works the price out again; this is only what the page shows.
    const quoted =
      product.type === "BUNDLE"
        ? storeApi
            .bundleQuote(product.id)
            .then(setQuote)
            .catch(() => setQuote(null))
        : Promise.resolve();
    void Promise.all([purchases, quoted]).finally(() => setOwnershipChecked(true));
  }, [ready, user, product, owned]);

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
    if (!ready || !user || !product || !ownershipChecked || owned || quote?.nothingToBuy) return;

    autoBuyTriggered.current = true;
    router.replace(`/p/${product.slug}`);
    void buy(product.id, product.title, buyerOf(user));
  }, [searchParams, ready, user, product, ownershipChecked, owned, quote, buy, router]);

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
  const isBundle = product.type === "BUNDLE";
  const primary = product.assets.find((asset) => asset.kind === "PRIMARY_FILE");
  // A bundle has no file of its own: it is opened from the library.
  const canRead = !isBundle && (isFree || owned) && Boolean(primary);
  const canDownload = canRead && storeDownloads !== null && isDownloadAllowed(product.downloadPolicy, storeDownloads);
  const hasSample = product.assets.some((asset) => asset.kind === "SAMPLE_PREVIEW");
  const here = `/p/${product.slug}`;
  const hasLinks = product.links.length > 0;
  const contents = product.contents ?? [];
  const ownedIds = new Set(quote?.owned.map((o) => o.id));
  const totalPages = contents.reduce((sum, item) => sum + (item.pageCount ?? 0), 0);
  // Holding every PDF already, or the bundle itself: nothing left to buy.
  const hasEverything = isBundle && (owned || Boolean(quote?.nothingToBuy));
  const partPrice =
    isBundle && !isFree && quote && !quote.nothingToBuy && quote.payMinor !== quote.priceMinor ? quote : null;

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

        {isBundle && contents.length > 0 && (
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
              <Layers className="size-5 text-primary" />
              What&apos;s in this bundle · {contents.length} PDF{contents.length === 1 ? "" : "s"}
            </h2>
            <ol className="divide-y rounded-xl border">
              {contents.map((item, index) => (
                <li key={item.id} className="flex items-start gap-3 px-4 py-3">
                  <span className="mt-0.5 w-5 shrink-0 text-sm text-muted-foreground">{index + 1}.</span>
                  <div className="min-w-0 flex-1">
                    {item.slug ? (
                      <Link href={`/p/${item.slug}`} className="font-medium hover:underline">
                        {item.title}
                      </Link>
                    ) : (
                      <p className="font-medium">{item.title}</p>
                    )}
                    {item.subtitle && <p className="text-sm text-muted-foreground">{item.subtitle}</p>}
                    <p className="text-xs text-muted-foreground">
                      {[
                        item.pageCount !== null ? `${item.pageCount} pages` : null,
                        item.slug && item.priceMinor !== null
                          ? `Also sold on its own${item.priceMinor === "0" ? ", free" : ` for ${formatMoney(item.priceMinor, product.currency)}`}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  {ownedIds.has(item.id) && (
                    <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 className="size-3.5" />
                      You have this
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </section>
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
              ) : partPrice ? (
                <>
                  <span className="text-2xl font-semibold">{formatMoney(partPrice.payMinor, product.currency)}</span>
                  <span className="text-muted-foreground line-through">
                    {formatMoney(partPrice.priceMinor, product.currency)}
                  </span>
                </>
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

            {partPrice && (
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
                {(() => {
                  const paidOwned = partPrice.owned.filter((o) => !o.free);
                  const allPaid = partPrice.paidPdfs === partPrice.totalPdfs;
                  return (
                    <>
                      You already have {partPrice.paidOwned} of {allPaid ? "these" : "the"} {partPrice.paidPdfs}
                      {allPaid ? "" : " paid"} PDFs
                      {paidOwned.length <= 3 && ` (${paidOwned.map((o) => o.title).join(", ")})`}, so you pay only for the
                      other {partPrice.paidPdfs - partPrice.paidOwned}.{!allPaid && " Free PDFs don't change the price."}
                    </>
                  );
                })()}
              </p>
            )}

            {owned && !isFree && (
              <Badge variant="secondary" className="w-full justify-center py-1">
                In your library
              </Badge>
            )}

            {hasEverything ? (
              <>
                {!owned && (
                  <p className="text-sm text-muted-foreground">You already have every PDF in this bundle.</p>
                )}
                <Link href="/library" className={buttonVariants({ className: "w-full" })}>
                  <Library className="size-4" />
                  Open my library
                </Link>
              </>
            ) : canRead ? (
              <div className="space-y-2">
                <Link href={readHref(product.id, here)} className={buttonVariants({ className: "w-full" })}>
                  <BookOpenText className="size-4" />
                  Read now
                </Link>
                {canDownload && (
                  <Button variant="outline" className="w-full" onClick={download} disabled={downloading}>
                    <Download className="size-4" />
                    {downloading ? "Preparing…" : "Download PDF"}
                  </Button>
                )}
              </div>
            ) : !ready ? (
              <Button className="w-full" disabled>
                <Loader2 className="size-4 animate-spin" />
              </Button>
            ) : user ? (
              <Button
                className="w-full"
                disabled={busy || (isBundle && !ownershipChecked)}
                onClick={() => buy(product.id, product.title, buyerOf(user))}
              >
                {busy
                  ? isFree
                    ? "Adding…"
                    : "Opening checkout…"
                  : isBundle && isFree
                    ? "Add to my library"
                    : "Buy now"}
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
                  {isBundle && isFree ? "Sign in to get it free" : "Sign in to buy"}
                </Button>
                {/* Someone who already bought this and came back on another
                    device would otherwise see only "Buy now" and reasonably
                    conclude they had to pay twice. */}
                <p className="text-center text-xs text-muted-foreground">
                  Already purchased? Sign in to access it.
                </p>
              </>
            )}

            {/* Look inside before buying. Its own short file: reading it gives away only those pages. */}
            {hasSample && !canRead && !hasEverything && (
              <Link
                href={`/read/${product.id}?sample=1&back=${encodeURIComponent(here)}`}
                className={buttonVariants({ variant: "outline", className: "w-full" })}
              >
                <Eye className="size-4" />
                Read a sample
              </Link>
            )}

            {isBundle && contents.length > 0 && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Layers className="size-4" />
                Bundle · {contents.length} PDF{contents.length === 1 ? "" : "s"}
                {totalPages > 0 && ` · ${totalPages} pages`}
              </div>
            )}

            {!isBundle && primary && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileText className="size-4" />
                PDF
                {primary.pageCount && ` · ${primary.pageCount} pages`}
                {primary.sizeBytes && ` · ${formatBytes(primary.sizeBytes)}`}
              </div>
            )}

            {isBundle && !hasEverything && (
              <p className="text-xs text-muted-foreground">
                Every PDF in the bundle goes straight into your library{isFree ? "" : " after payment"}, as one bundle you can
                open and read from any time.
              </p>
            )}

            {!isBundle && !canRead && (
              <p className="text-xs text-muted-foreground">
                Read it here right after payment, on any device, from where you left off. It goes straight into your library, so it is always there without digging through email receipts.
              </p>
            )}
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

/** What the payment form is prefilled with — the account's own details, never typed ones. */
function buyerOf(user: AuthUser): { email?: string; name: string; phone?: string } {
  return { email: user.email ?? undefined, name: user.name, phone: user.phone ?? undefined };
}
