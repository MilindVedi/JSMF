/**
 * First-party activity analytics — a tiny, fire-and-forget tracker.
 *
 * The one rule this file exists to keep: **nothing here may ever affect the
 * site.** `track()` returns nothing, throws nothing and never awaits anything.
 * Events are queued in memory and sent in the background, in batches, to
 * `/api/analytics/events` (this site's own proxy, so same-origin). If that
 * endpoint is down, slow, throttled or switched off, events are silently lost
 * and the page behaves exactly as it would without this file.
 *
 * What is sent: event name, pathname (never the query string), the external
 * referrer, utm_* tags from the landing URL, a few small props, and two random
 * ids this browser made up for itself — a visitor id (localStorage) and a
 * per-tab session id (sessionStorage, new after 30 idle minutes). No cookies,
 * no fingerprinting, no third parties. See docs/analytics/README.md.
 *
 * Off when NEXT_PUBLIC_ANALYTICS_ENABLED is "false" (inlined at build time;
 * unset means on), on the server, and for automated browsers.
 */

import { getAccessToken } from "@/lib/api/client";

export type AnalyticsEventName =
  | "page_view"
  | "book_click"
  | "register_open"
  | "register_step"
  | "signin_start"
  | "checkout_open"
  | "checkout_dismiss"
  | "payment_success"
  | "payment_error"
  | "contact_open"
  | "outbound_click";

type Props = Record<string, string | number | boolean>;

interface QueuedEvent {
  name: AnalyticsEventName;
  path: string;
  referrer?: string;
  utm?: { source?: string; medium?: string; campaign?: string };
  props?: Props;
  visitorId: string;
  sessionId: string;
  at: string;
}

const ENDPOINT = "/api/analytics/events";
const VISITOR_KEY = "jsmf.analytics.visitor";
const SESSION_KEY = "jsmf.analytics.session";
const UTM_KEY = "jsmf.analytics.utm";
const SESSION_IDLE_MS = 30 * 60 * 1000;
const FLUSH_INTERVAL_MS = 5000;
/**
 * A page view goes out after a second rather than five: someone who opens a
 * page and leaves within five seconds is common, and the unload beacon is the
 * least reliable delivery path there is.
 */
const PAGE_VIEW_FLUSH_MS = 1000;
/**
 * Events that are usually followed straight away by leaving the page (to
 * Razorpay's page, Google sign-in, Telegram). Sent at once — a `keepalive`
 * fetch is asynchronous and outlives the navigation — instead of waiting.
 */
const SEND_NOW: ReadonlySet<AnalyticsEventName> = new Set(["book_click", "signin_start", "outbound_click"]);
/** Matches the server's per-request limit. */
const MAX_BATCH = 20;
/** If the endpoint is unreachable for a long time, stop growing memory. */
const MAX_QUEUE = 100;

let queue: QueuedEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let listening = false;
let memoryVisitorId: string | null = null;
let memorySession: { id: string; last: number } | null = null;
let memoryUtm: QueuedEvent["utm"] | null | undefined;
/**
 * `document.referrer` keeps naming the site someone arrived from for as long
 * as the document lives, client-side navigations included — so only the first
 * page view of a page load carries it.
 */
let referrerSent = false;

/** Record an event. Safe to call anywhere, any time; never throws, never blocks. */
export function track(name: AnalyticsEventName, props?: Props): void {
  try {
    if (!enabled()) return;
    const event: QueuedEvent = {
      name,
      path: window.location.pathname,
      visitorId: visitorId(),
      sessionId: sessionId(),
      at: new Date().toISOString(),
    };
    if (props && Object.keys(props).length > 0) event.props = props;
    if (name === "page_view" && !referrerSent) {
      referrerSent = true;
      const referrer = externalReferrer();
      if (referrer) event.referrer = referrer;
    }
    const utm = campaign();
    if (utm) event.utm = utm;

    if (queue.length >= MAX_QUEUE) queue.shift();
    queue.push(event);
    listen();
    if (SEND_NOW.has(name)) flush(false);
    else schedule(name === "page_view" ? PAGE_VIEW_FLUSH_MS : FLUSH_INTERVAL_MS);
  } catch {
    // Analytics must never be the reason anything else fails.
  }
}

function enabled(): boolean {
  if (typeof window === "undefined") return false;
  if (process.env.NEXT_PUBLIC_ANALYTICS_ENABLED === "false") return false;
  // Automation (Selenium, Puppeteer, headless crawlers) sets this.
  if (navigator.webdriver) return false;
  return true;
}

let timerDue = 0;

function schedule(delay: number): void {
  const due = Date.now() + delay;
  if (timer !== null) {
    if (due >= timerDue) return;
    clearTimeout(timer);
  }
  timerDue = due;
  timer = setTimeout(() => {
    timer = null;
    flush(false);
  }, delay);
}

/** Last chance before the tab goes away or into the background. */
function listen(): void {
  if (listening) return;
  listening = true;
  const leave = () => flush(true);
  window.addEventListener("pagehide", leave);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") leave();
  });
}

function flush(beacon: boolean): void {
  try {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    while (queue.length > 0) {
      const batch = queue.splice(0, MAX_BATCH);
      send(JSON.stringify({ app: "MAIN", events: batch }), beacon);
    }
  } catch {
    queue = [];
  }
}

/**
 * text/plain on purpose: it is what sendBeacon can send without a CORS
 * preflight, and using it for fetch too keeps one request shape. Nothing reads
 * the response; a failed request is dropped, not retried.
 */
function send(body: string, beacon: boolean): void {
  if (beacon && typeof navigator.sendBeacon === "function") {
    try {
      if (navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "text/plain" }))) return;
    } catch {
      // Fall through to fetch.
    }
  }

  const headers: Record<string, string> = { "Content-Type": "text/plain" };
  // Only when already in memory — a sync read, no refresh. Lets the server
  // attach the signed-in user; without it the event is simply anonymous.
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    void fetch(ENDPOINT, { method: "POST", body, headers, keepalive: true, credentials: "omit" }).catch(
      () => undefined,
    );
  } catch {
    // Old browsers without keepalive, or fetch itself missing: drop the batch.
  }
}

function visitorId(): string {
  try {
    const stored = window.localStorage.getItem(VISITOR_KEY);
    if (stored && /^[0-9a-f-]{36}$/i.test(stored)) return stored;
    const id = uuid();
    window.localStorage.setItem(VISITOR_KEY, id);
    return id;
  } catch {
    memoryVisitorId ??= uuid();
    return memoryVisitorId;
  }
}

function sessionId(): string {
  const now = Date.now();
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    const stored = raw ? (JSON.parse(raw) as { id?: unknown; last?: unknown }) : null;
    const id =
      stored && typeof stored.id === "string" && typeof stored.last === "number" && now - stored.last < SESSION_IDLE_MS
        ? stored.id
        : sessionToken();
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify({ id, last: now }));
    return id;
  } catch {
    if (!memorySession || now - memorySession.last >= SESSION_IDLE_MS) memorySession = { id: sessionToken(), last: now };
    memorySession.last = now;
    return memorySession.id;
  }
}

/**
 * utm_* tags from the URL a session landed on, kept for the rest of that
 * session so a later "book_click" is still attributed to the campaign.
 */
function campaign(): QueuedEvent["utm"] | null {
  if (memoryUtm !== undefined) return memoryUtm;
  let utm: QueuedEvent["utm"] | null = null;
  try {
    const stored = window.sessionStorage.getItem(UTM_KEY);
    if (stored !== null) {
      utm = stored ? (JSON.parse(stored) as QueuedEvent["utm"]) : null;
    } else {
      const params = new URLSearchParams(window.location.search);
      const pick = (key: string) => params.get(key)?.trim().slice(0, 128) || undefined;
      const found = { source: pick("utm_source"), medium: pick("utm_medium"), campaign: pick("utm_campaign") };
      utm = found.source || found.medium || found.campaign ? found : null;
      window.sessionStorage.setItem(UTM_KEY, utm ? JSON.stringify(utm) : "");
    }
  } catch {
    utm = null;
  }
  memoryUtm = utm;
  return utm;
}

/** Another site's address, host + path only. Nothing for in-site navigation. */
function externalReferrer(): string | undefined {
  try {
    if (!document.referrer) return undefined;
    const url = new URL(document.referrer);
    if (url.host === window.location.host) return undefined;
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return `${url.host}${url.pathname}`.slice(0, 512);
  } catch {
    return undefined;
  }
}

function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // Older browsers: a v4-shaped id from getRandomValues, or Math.random as a last resort.
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") crypto.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function sessionToken(): string {
  return uuid().replace(/-/g, "");
}
