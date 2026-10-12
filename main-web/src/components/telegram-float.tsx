import { Send } from "lucide-react";
import { links } from "@/lib/site-content";

/**
 * A small "Join us on Telegram" pill fixed to the centre-right edge, on the
 * home and /prep-kit pages — the two places a visitor is deciding whether to
 * follow along. It idly peeks out from the edge and settles, to catch the eye
 * without demanding a dismissal the way the trailer does.
 *
 * A plain link, not a widget: the click is a normal navigation, so the one
 * passive outbound-click listener in AnalyticsTracker already counts it as
 * `outbound_click: telegram` without this touching analytics. No JS state, so
 * no "use client" — it renders on the server. The animation is pure CSS and is
 * switched off under prefers-reduced-motion (globals.css, `telegram-float`).
 *
 * It sits at the vertical centre, clear of the bottom-right FloatingVideo, and
 * below the registration dialog's overlay (z-40 vs z-100), so opening the
 * dialog covers it rather than leaving it floating over the form.
 */
export function TelegramFloat() {
  return (
    <a
      href={links.telegram}
      target="_blank"
      rel="noreferrer"
      aria-label="Join the JSMF Telegram channel"
      className="group fixed right-3 top-1/2 z-40 -translate-y-1/2 transition-transform duration-300 hover:scale-105 md:right-5"
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
