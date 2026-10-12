"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { track } from "@/lib/analytics";
import { links } from "@/lib/site-content";

/**
 * The last page view sent, so React Strict Mode's double-run of effects in
 * development (and any remount of the layout) does not count one view twice.
 */
let lastView: { path: string; at: number } | null = null;

/** Which outbound destinations are worth naming; anything else is "other". */
function outboundTarget(href: string): string | null {
  try {
    const url = new URL(href, window.location.href);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.host === window.location.host) return null;
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtube.com" || host === "youtu.be" || host.endsWith(".youtube.com")) return "youtube";
    if (host === "t.me" || host === "telegram.me") return "telegram";
    if (host === "instagram.com") return "instagram";
    if (host === "rzp.io" || host.endsWith(".razorpay.com")) return "razorpay";
    try {
      if (host === new URL(links.store).hostname.replace(/^www\./, "")) return "store";
    } catch {
      // A malformed store URL just means store links count as "other".
    }
    return "other";
  } catch {
    return null;
  }
}

/**
 * Mounted once in the root layout; renders nothing.
 *
 * - `page_view` on first load and on every client-side route change.
 * - `outbound_click` for links leaving the site, from one passive listener on
 *   the document — so no link anywhere needed changing, and the click itself
 *   is never delayed, prevented or altered.
 */
export function AnalyticsTracker() {
  const pathname = usePathname();

  useEffect(() => {
    const now = Date.now();
    if (lastView && lastView.path === pathname && now - lastView.at < 2000) return;
    lastView = { path: pathname, at: now };
    track("page_view");
  }, [pathname]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      try {
        const anchor = (event.target as Element | null)?.closest?.("a[href]");
        if (!anchor) return;
        const target = outboundTarget(anchor.getAttribute("href") ?? "");
        if (target) track("outbound_click", { target });
      } catch {
        // Never interfere with a click.
      }
    };
    document.addEventListener("click", onClick, { capture: true, passive: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);

  return null;
}
