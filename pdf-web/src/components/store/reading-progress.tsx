import Link from "next/link";
import { BookOpenText } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import type { Entitlement, ReadingProgressSummary } from "@/lib/api/store";

/** The reader for a product, returning to `back` (a path on this site). */
export function readHref(productId: string, back = "/library"): string {
  return `/read/${productId}?back=${encodeURIComponent(back)}`;
}

/** A started read: any page past the first. Opening a book is not reading it. */
export function hasStarted(progress: ReadingProgressSummary | null): progress is ReadingProgressSummary {
  return Boolean(progress && progress.page > 1);
}

export function percentRead(progress: ReadingProgressSummary): number {
  return Math.round((progress.page / Math.max(1, progress.pageCount)) * 100);
}

/** "Page 23 of 40", with a thin bar. Nothing when the reader has not started. */
export function ProgressLine({ progress, className = "" }: { progress: ReadingProgressSummary | null; className?: string }) {
  if (!hasStarted(progress)) return null;
  const percent = percentRead(progress);
  return (
    <div className={className}>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Page {progress.page} of {progress.pageCount}
        </span>
        <span className="tabular-nums">{percent}%</span>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

interface Started {
  productId: string;
  title: string;
  progress: ReadingProgressSummary;
}

/**
 * The few things this reader is in the middle of, most recent first — the
 * Kindle "continue reading" shelf. PDFs inside bundles count too, once each:
 * a PDF owned on its own and inside a bundle is one book on the shelf.
 */
export function startedReads(items: Entitlement[], limit = 3): Started[] {
  const started = new Map<string, Started>();
  const add = (read: Started) => {
    const known = started.get(read.productId);
    if (!known || Date.parse(read.progress.updatedAt) > Date.parse(known.progress.updatedAt)) {
      started.set(read.productId, read);
    }
  };
  for (const item of items) {
    if (item.contents) {
      for (const child of item.contents) {
        if (hasStarted(child.progress)) add({ productId: child.id, title: child.title, progress: child.progress });
      }
    } else if (hasStarted(item.progress)) {
      add({ productId: item.productId, title: item.product.title, progress: item.progress });
    }
  }
  return [...started.values()]
    .sort((a, b) => Date.parse(b.progress.updatedAt) - Date.parse(a.progress.updatedAt))
    .slice(0, limit);
}

export function ContinueReading({ items }: { items: Entitlement[] }) {
  const started = startedReads(items);
  if (started.length === 0) return null;

  return (
    <section aria-labelledby="continue-reading" className="library-enter mb-8">
      <h2 id="continue-reading" className="text-xs font-semibold text-foreground">
        Continue reading
      </h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {started.map((read) => (
          <Link
            key={read.productId}
            href={readHref(read.productId)}
            className="group flex items-center gap-4 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-md bg-accent text-primary">
              <BookOpenText size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium group-hover:underline">{read.title}</span>
              <ProgressLine progress={read.progress} className="mt-1.5" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/** The card's main action: Read, or Continue reading once started. */
export function ReadButton({
  productId,
  progress,
  size,
}: {
  productId: string;
  progress: ReadingProgressSummary | null;
  size?: "sm";
}) {
  return (
    <Link href={readHref(productId)} className={buttonVariants({ size: size ?? "default" })}>
      <BookOpenText size={size ? 15 : 16} />
      {hasStarted(progress) ? "Continue reading" : "Read"}
    </Link>
  );
}
