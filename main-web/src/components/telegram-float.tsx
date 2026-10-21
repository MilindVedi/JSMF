"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { links } from "@/lib/site-content";

/** How high the visitor last put it. Per browser, and shared by both pages. */
const PLACE_KEY = "jsmf.telegram-float.top";
/** Kept this far from the top and bottom of the screen, so it is never half off. */
const EDGE_GAP = 8;
/** Below this much movement it was a click, not a drag. */
const DRAG_START = 4;

/**
 * A small "Join us on Telegram" pill floating at the right edge, on the home
 * and /prep-kit pages — the two places a visitor is deciding whether to follow
 * along. It idly peeks out from the edge and settles, to catch the eye without
 * demanding a dismissal the way the trailer does.
 *
 * It can be dragged up and down, because at the vertical centre it sits over
 * whatever is there — the testimonial row's arrow button, a line of the hero.
 * It stays against the right edge throughout: the pill is drawn to lean out
 * from that edge, and left loose in the middle of the screen it reads as a
 * stray button rather than a tab. How high it was put is remembered in this
 * browser and used on both pages, and it is pulled back into view when the
 * window changes size or the phone is turned.
 *
 * It stays a plain link, so the one passive outbound-click listener in
 * AnalyticsTracker still counts it as `outbound_click: telegram` without this
 * touching analytics. A drag is not a click: past a few pixels of movement the
 * `href` comes off for the rest of the gesture, which both stops the
 * navigation and keeps that listener (`a[href]`) from recording a visit that
 * never happened.
 *
 * The idle animation is pure CSS, on the inner pill rather than this element,
 * so it never fights the dragged position; it is switched off under
 * prefers-reduced-motion (globals.css, `telegram-float`).
 *
 * It starts clear of the bottom-right FloatingVideo, and sits below the
 * registration dialog's overlay (z-40 vs z-100), so opening the dialog covers
 * it rather than leaving it floating over the form.
 */
export function TelegramFloat() {
  const ref = useRef<HTMLAnchorElement>(null);
  // null until it has been moved: the first render matches the server's, and
  // an untouched pill keeps its CSS position rather than a measured copy.
  const [top, setTop] = useState<number | null>(null);
  const drag = useRef<{ offset: number; from: number; moved: boolean } | null>(null);
  // What the last move worked out, to save without waiting for a render.
  const latest = useRef<number | null>(null);

  /** `offsetHeight` rather than the drawn box: the hover zoom must not count. */
  const onScreen = useCallback((next: number): number => {
    const height = ref.current?.offsetHeight ?? 0;
    return Math.min(Math.max(next, EDGE_GAP), Math.max(EDGE_GAP, window.innerHeight - height - EDGE_GAP));
  }, []);

  // Restored after the first paint, not during it: the pill has to be on the
  // page to be measured, and the first render has to match the server's.
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const stored = window.localStorage.getItem(PLACE_KEY);
        const saved = Number(stored);
        if (stored === null || !Number.isFinite(saved)) return;
        latest.current = onScreen(saved);
        setTop(latest.current);
      } catch {
        // A browser with storage switched off simply gets the default spot.
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [onScreen]);

  useEffect(() => {
    const onResize = () => setTop((current) => (current === null ? current : onScreen(current)));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [onScreen]);

  function onPointerDown(event: React.PointerEvent<HTMLAnchorElement>) {
    // Left button or a touch only: a right-click should still open the menu.
    if (event.button !== 0) return;
    drag.current = {
      offset: event.clientY - event.currentTarget.getBoundingClientRect().top,
      from: event.clientY,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent<HTMLAnchorElement>) {
    const held = drag.current;
    if (!held) return;
    if (!held.moved) {
      if (Math.abs(event.clientY - held.from) <= DRAG_START) return;
      held.moved = true;
      // Off for the rest of the gesture: no navigation, and no counted click.
      event.currentTarget.removeAttribute("href");
    }
    latest.current = onScreen(event.clientY - held.offset);
    setTop(latest.current);
  }

  function onPointerUp(event: React.PointerEvent<HTMLAnchorElement>) {
    const held = drag.current;
    drag.current = null;
    if (!held) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (!held.moved) return;
    const anchor = event.currentTarget;
    // After this gesture's click has come and gone, it is a link again.
    window.setTimeout(() => anchor.setAttribute("href", links.telegram), 0);
    try {
      if (latest.current !== null) window.localStorage.setItem(PLACE_KEY, String(Math.round(latest.current)));
    } catch {
      // Not remembering where it was put is a small loss, never an error.
    }
  }

  return (
    <a
      ref={ref}
      href={links.telegram}
      target="_blank"
      rel="noreferrer"
      aria-label="Join the JSMF Telegram channel"
      title="Drag up or down to move"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDragStart={(event) => event.preventDefault()}
      style={top === null ? undefined : { top }}
      className={`group fixed right-3 z-40 cursor-grab touch-none select-none transition-transform duration-300 hover:scale-105 active:cursor-grabbing md:right-5 ${
        top === null ? "top-1/2 -translate-y-1/2" : ""
      }`}
    >
      {/* Icon-only on phones, where a labelled pill at the vertical centre
          would sit over the hero text; the label unfolds from `sm` up, where
          there is margin to spare beside the content. */}
      <span className="telegram-float p-2 sm:py-2.5 sm:pl-2.5 sm:pr-5">
        <span className="relative grid size-9 shrink-0 place-items-center rounded-full bg-primary-foreground/15">
          <Send size={17} className="tg-plane" />
          <span aria-hidden className="tg-dot absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-primary-foreground" />
        </span>
        <span className="hidden text-left text-xs font-bold leading-tight sm:block">
          Join us on
          <span className="block text-[13px] tracking-wide">Telegram</span>
        </span>
      </span>
    </a>
  );
}
