import Link from "next/link";
import { ArrowRight, FileText, Play } from "lucide-react";
import type { StorefrontProduct } from "@/lib/api/store";
import { formatMoney } from "@/lib/money";

/**
 * One resource in a grid. Shared by the landing page's featured strip and the
 * browse catalogue so the two cannot drift apart visually.
 *
 * Always links to `/p/{slug}` — the permanent, shareable address a YouTube
 * description points at, which is why it is not nested under `/browse`.
 */
export function ResourceCard({ product }: { product: StorefrontProduct }) {
  // Only ever present on the storefront listing (see the type), and only
  // non-empty when a YOUTUBE link exists — never the buyer-only case of
  // "an OTHER link but no video", which the card correctly says nothing about.
  const hasVideo = (product.links?.length ?? 0) > 0;

  // The design shows a fixed "NEET-PG • Anatomy" pair above the title. Here
  // that comes from whatever taxonomies the product actually carries, in the
  // admin's own ordering, so a product tagged only by subject still renders a
  // sensible line and a new taxonomy needs no change here.
  const [firstTerm, secondTerm] = product.taxonomyTerms.slice(0, 2);

  return (
    <Link
      href={`/p/${product.slug}`}
      className="group block overflow-hidden rounded-2xl border border-border bg-card transition-all hover:-translate-y-1 hover:border-primary/25 hover:shadow-editorial"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        {product.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- a signed,
          // time-limited storage URL; next/image would need every storage
          // host allow-listed and would re-proxy an already-CDN-served file.
          //
          // object-contain, not the design's object-cover: an admin uploads
          // whatever aspect ratio their cover happens to be, and `cover` would
          // crop into it to fill the 4:3 box — silently cutting off part of an
          // image nobody asked to have cropped. `contain` always shows the
          // whole upload, letterboxed on `bg-muted` when the ratio differs.
          <img
            src={product.coverUrl}
            alt=""
            loading="lazy"
            className="size-full object-contain transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex size-full items-center justify-center">
            <FileText className="size-10 text-muted-foreground/40" />
          </div>
        )}

        {/* A companion video is the strongest signal on the card after the
            title — most buyers here arrived FROM a video and recognise the
            badge, and it tells everyone else this resource has a lesson to go
            with it. */}
        {hasVideo && (
          <span className="absolute left-4 top-4 inline-flex items-center gap-1 rounded-full bg-overlay px-2.5 py-1 text-[10px] font-bold text-overlay-foreground">
            <Play className="size-2.5" fill="currentColor" />
            Video
          </span>
        )}
      </div>

      <div className="p-5">
        {firstTerm && (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase text-primary">
            <span>{firstTerm.term.name}</span>
            {secondTerm && (
              <>
                <span className="text-border">•</span>
                <span className="text-muted-foreground">{secondTerm.term.name}</span>
              </>
            )}
          </div>
        )}

        <h3 className="min-h-14 font-display text-lg font-semibold leading-snug text-foreground transition-colors group-hover:text-primary">
          {product.title}
        </h3>

        {product.subtitle && (
          <p className="mt-2 min-h-10 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
            {product.subtitle}
          </p>
        )}

        <div className="mt-5 flex items-end justify-between border-t border-border pt-4">
          <div>
            {product.accessType === "FREE" ? (
              <span className="font-display text-lg font-semibold text-brand-ink">Free</span>
            ) : (
              <>
                <span className="mr-2 font-display text-lg font-semibold text-brand-ink">
                  {formatMoney(product.priceAmountMinor, product.currency)}
                </span>
                {product.compareAtAmountMinor && (
                  <span className="text-xs text-muted-foreground line-through">
                    {formatMoney(product.compareAtAmountMinor, product.currency)}
                  </span>
                )}
              </>
            )}
          </div>

          <span className="flex items-center gap-1 text-xs font-semibold text-primary">
            View
            <ArrowRight className="size-3.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}
