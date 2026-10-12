import { Send } from "lucide-react";
import { socials } from "@/lib/site-content";

/**
 * A small "Join us on Telegram" pill fixed to the centre-right edge of the
 * storefront landing page — kept in step with main-web's
 * components/telegram-float.tsx (same markup, animation and tokens).
 *
 * A plain link with no JS state, so no "use client": it renders on the server.
 * Icon-only on phones, where a labelled pill at the vertical centre would sit
 * over the hero text; the label unfolds from `sm` up. The animation is pure
 * CSS and is switched off under prefers-reduced-motion (globals.css,
 * `telegram-float`). z-40 keeps it below the contact dialog overlay.
 */
export function TelegramFloat() {
  return (
    <a
      href={socials.telegram}
      target="_blank"
      rel="noreferrer"
      aria-label="Join the JSMF Telegram channel"
      className="group fixed right-3 top-1/2 z-40 -translate-y-1/2 transition-transform duration-300 hover:scale-105 md:right-5"
    >
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
