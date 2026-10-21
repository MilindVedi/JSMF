"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * A row that scrolls sideways, with arrow buttons in place of a scrollbar.
 * Shared by the testimonial screenshots and the quote cards so both rows
 * behave the same way.
 *
 * The row bleeds to the screen edge (-mx-5/-mx-8) so a card can sit half off
 * the edge: that peek is what tells someone there is more to the side, which
 * a tidy row ending flush with the margin never does. The arrows appear from
 * `sm` up, where a pointer is likely; on a phone the row is swiped. Each
 * arrow hides once its end is reached — a button that does nothing is worse
 * than no button.
 *
 * `count` is the number of cards: it re-checks the arrows when cards are
 * added or removed, since neither event resizes the window.
 */
export function ScrollRow({
  children,
  count,
  tone = "light",
  previousLabel,
  nextLabel,
  className = "",
}: {
  children: React.ReactNode;
  count: number;
  tone?: "light" | "dark";
  previousLabel: string;
  nextLabel: string;
  /** Extra classes for the scrolling row itself, e.g. its gap. */
  className?: string;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [canScroll, setCanScroll] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const row = rowRef.current;
    if (!row) return;
    const max = row.scrollWidth - row.clientWidth;
    setCanScroll({ left: row.scrollLeft > 4, right: row.scrollLeft < max - 4 });
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure, count]);

  /** About one card and its gap, so a tap advances by roughly one card. */
  const scrollByCards = (direction: 1 | -1) => {
    const row = rowRef.current;
    if (!row) return;
    const card = row.firstElementChild as HTMLElement | null;
    const step = card ? card.offsetWidth + 20 : row.clientWidth * 0.8;
    row.scrollBy({ left: direction * step, behavior: "smooth" });
  };

  const arrow =
    tone === "dark"
      ? "border-brand-line bg-brand-deep/60 text-brand-on-deep hover:bg-brand-deep/90"
      : "border-border bg-background/60 text-brand-deep hover:bg-background/90";
  // z-50 keeps an arrow clickable where the fixed Telegram pill (z-40, pinned
  // at the centre-right of the screen) would otherwise sit on top of it.
  const button =
    "absolute top-1/2 z-50 hidden size-11 -translate-y-1/2 place-items-center rounded-full border shadow-editorial backdrop-blur transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:grid";

  return (
    <div className="relative">
      <div
        ref={rowRef}
        onScroll={measure}
        // scroll-pl matches the padding, so a snapped card lines up with the
        // page margin and the row rests at zero instead of a few pixels in —
        // which would otherwise show a "previous" arrow before anything moved.
        className={`no-scrollbar -mx-5 flex snap-x snap-mandatory scroll-pl-5 overflow-x-auto px-5 pb-2 lg:-mx-8 lg:scroll-pl-8 lg:px-8 ${className}`}
      >
        {children}
      </div>

      {canScroll.left && (
        <button
          type="button"
          onClick={() => scrollByCards(-1)}
          aria-label={previousLabel}
          className={`${button} left-1 ${arrow}`}
        >
          <ChevronLeft size={22} />
        </button>
      )}
      {canScroll.right && (
        <button
          type="button"
          onClick={() => scrollByCards(1)}
          aria-label={nextLabel}
          className={`${button} right-1 ${arrow}`}
        >
          <ChevronRight size={22} />
        </button>
      )}
    </div>
  );
}
