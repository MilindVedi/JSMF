"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GripVertical, X } from "lucide-react";

const VIDEO_ID = "CXZ4UPsoAEI";
const MARGIN = 16;
// Remembers a dismissal for the rest of the browsing session, so closing it on
// one page keeps it closed while navigating — but a fresh visit shows it again.
const DISMISSED_KEY = "jsmf-floating-video-dismissed";

function wasDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

type Offset = { x: number; y: number };

/**
 * A muted trailer that slides in and parks bottom-right, draggable anywhere.
 *
 * Position is kept as an offset from the resting corner rather than absolute
 * coordinates, so the box stays put relative to that corner when the window is
 * resized and the CSS slide-in animation still lands in the right place.
 */
export function FloatingVideo() {
  const [shown, setShown] = useState(false);
  const [closed, setClosed] = useState(false);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  const boxRef = useRef<HTMLDivElement>(null);
  const origin = useRef({ pointerX: 0, pointerY: 0, x: 0, y: 0 });

  useEffect(() => {
    if (wasDismissed()) return;
    const timer = window.setTimeout(() => setShown(true), 1200);
    return () => window.clearTimeout(timer);
  }, []);

  function close() {
    setClosed(true);
    try {
      sessionStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Private mode or blocked storage: it simply reappears on the next page.
    }
  }

  /** Keeps the box on screen after a drag or a window resize. */
  const clamp = useCallback((next: Offset): Offset => {
    const box = boxRef.current;
    if (!box) return next;
    const { width, height } = box.getBoundingClientRect();
    const maxUp = window.innerHeight - height - MARGIN;
    const maxLeft = window.innerWidth - width - MARGIN;
    return {
      x: Math.min(0, Math.max(-maxLeft, next.x)),
      y: Math.min(0, Math.max(-maxUp, next.y)),
    };
  }, []);

  useEffect(() => {
    const onResize = () => setOffset(clamp);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clamp]);

  function startDrag(event: React.PointerEvent) {
    // Let the close button and the video itself behave normally.
    if ((event.target as HTMLElement).closest("button, iframe")) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    origin.current = { pointerX: event.clientX, pointerY: event.clientY, ...offset };
    setDragging(true);
  }

  function onDrag(event: React.PointerEvent) {
    if (!dragging) return;
    const { pointerX, pointerY, x, y } = origin.current;
    setOffset(clamp({ x: x + event.clientX - pointerX, y: y + event.clientY - pointerY }));
  }

  function endDrag(event: React.PointerEvent) {
    if (!dragging) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    setDragging(false);
  }

  if (!shown || closed) return null;

  // Browsers only allow autoplay when muted.
  const src = `https://www.youtube-nocookie.com/embed/${VIDEO_ID}?autoplay=1&mute=1&playsinline=1&loop=1&playlist=${VIDEO_ID}&rel=0&modestbranding=1`;

  return (
    <div
      ref={boxRef}
      onPointerDown={startDrag}
      onPointerMove={onDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
      className={`fixed right-4 bottom-4 z-40 w-[min(240px,calc(100vw-32px))] touch-none ${
        dragging ? "cursor-grabbing select-none" : "cursor-grab"
      }`}
    >
      {/* The slide-in animates this inner box, leaving the outer transform free for dragging. */}
      <div className="floating-video overflow-hidden rounded-xl border bg-black shadow-2xl">
        <div className="flex items-center justify-between bg-black/85 px-2 py-1 text-white/70">
          <GripVertical className="size-3.5" aria-hidden />
          <button
            type="button"
            onClick={close}
            aria-label="Close video"
            className="grid size-6 place-items-center rounded-full hover:bg-white/15 hover:text-white"
          >
            <X className="size-3.5" />
          </button>
        </div>
        <div className="aspect-video">
          <iframe
            src={src}
            title="JSMF video"
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            className="size-full"
          />
        </div>
      </div>
    </div>
  );
}
