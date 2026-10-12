import { JsmfApp } from '@prisma/client';

/**
 * The only event names the websites may record. Anything else in a batch is
 * dropped silently — a typo in a client, or someone posting junk, costs
 * nothing and stores nothing. Adding an event is a deliberate server change.
 */
export const ANALYTICS_EVENT_NAMES = [
  'page_view',
  'book_click',
  'register_open',
  'register_step',
  'signin_start',
  'checkout_open',
  'checkout_dismiss',
  'payment_success',
  'payment_error',
  'contact_open',
  'outbound_click',
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENT_NAMES)[number];

const ALLOWED = new Set<string>(ANALYTICS_EVENT_NAMES);

/** Most events one request may carry. The client flushes long before this. */
export const MAX_EVENTS_PER_BATCH = 20;
/** Upper bound on the whole request body, before any parsing. */
export const MAX_BODY_BYTES = 32 * 1024;
/** `props` serialised; larger is dropped (the event itself is kept). */
export const MAX_PROPS_BYTES = 2048;
const MAX_PROPS_KEYS = 12;
const MAX_PROP_STRING = 200;

/** The funnel shown on the admin page, in order. */
export const FUNNEL_STEPS = [
  'page_view',
  'book_click',
  'register_open',
  'checkout_open',
  'payment_success',
] as const satisfies readonly AnalyticsEventName[];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SESSION_ID = /^[A-Za-z0-9_-]{8,64}$/;
const PROP_KEY = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;

/** One row ready to insert — every field already checked and trimmed. */
export interface CleanAnalyticsEvent {
  app: JsmfApp;
  name: AnalyticsEventName;
  visitorId: string;
  sessionId: string;
  path: string;
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  props: Record<string, string | number | boolean> | null;
}

/**
 * The request body as it arrived — an object (application/json) or a string
 * (text/plain, which is what `navigator.sendBeacon` sends to avoid a CORS
 * preflight). Returns the events worth keeping; never throws.
 *
 * Validation drops rather than rejects. The sender is a background script on a
 * public page that never reads the response, so a 400 would tell nobody
 * anything — while one bad item failing a whole batch would lose the good ones.
 */
export function parseAnalyticsBatch(body: unknown): CleanAnalyticsEvent[] {
  let payload: unknown = body;
  if (typeof payload === 'string') {
    if (payload.length > MAX_BODY_BYTES) return [];
    try {
      payload = JSON.parse(payload);
    } catch {
      return [];
    }
  }
  if (!isRecord(payload) || !Array.isArray(payload.events)) return [];

  const app = parseApp(payload.app);
  if (!app) return [];

  const clean: CleanAnalyticsEvent[] = [];
  // Items past the limit are ignored rather than failing the batch.
  for (const raw of payload.events.slice(0, MAX_EVENTS_PER_BATCH)) {
    const event = parseEvent(raw, app);
    if (event) clean.push(event);
  }
  return clean;
}

function parseApp(value: unknown): JsmfApp | null {
  if (value === undefined || value === null) return JsmfApp.MAIN;
  return typeof value === 'string' && (Object.values(JsmfApp) as string[]).includes(value)
    ? (value as JsmfApp)
    : null;
}

function parseEvent(raw: unknown, app: JsmfApp): CleanAnalyticsEvent | null {
  if (!isRecord(raw)) return null;

  const { name, visitorId, sessionId } = raw;
  if (typeof name !== 'string' || !ALLOWED.has(name)) return null;
  if (typeof visitorId !== 'string' || !UUID.test(visitorId)) return null;
  if (typeof sessionId !== 'string' || !SESSION_ID.test(sessionId)) return null;

  const path = cleanPath(raw.path);
  if (!path) return null;

  const utm = isRecord(raw.utm) ? raw.utm : {};

  return {
    app,
    name: name as AnalyticsEventName,
    visitorId: visitorId.toLowerCase(),
    sessionId,
    path,
    referrer: cleanReferrer(raw.referrer),
    utmSource: cleanText(utm.source, 128),
    utmMedium: cleanText(utm.medium, 128),
    utmCampaign: cleanText(utm.campaign, 128),
    props: cleanProps(raw.props),
  };
}

/** A pathname only: `/prep-kit`. Query strings and fragments are cut. */
function cleanPath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const path = value.split(/[?#]/)[0].trim();
  if (!path.startsWith('/') || path.startsWith('//')) return null;
  return path.slice(0, 512);
}

/**
 * `www.google.com/` from `https://www.google.com/?q=...`. Host and path only:
 * a referrer's query string is where other sites put search terms and
 * session ids, none of which are ours to keep.
 */
function cleanReferrer(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  try {
    const url = new URL(value.includes('://') ? value : `https://${value}`);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    const host = url.hostname.toLowerCase();
    if (!host) return null;
    return `${host}${url.pathname}`.slice(0, 512);
  } catch {
    return null;
  }
}

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text ? text.slice(0, max) : null;
}

/** Flat, small, primitive-only. Anything else and the props are dropped. */
function cleanProps(value: unknown): CleanAnalyticsEvent['props'] {
  if (!isRecord(value)) return null;
  const entries = Object.entries(value);
  if (entries.length === 0 || entries.length > MAX_PROPS_KEYS) return null;

  const props: Record<string, string | number | boolean> = {};
  for (const [key, raw] of entries) {
    if (!PROP_KEY.test(key)) return null;
    if (typeof raw === 'string') props[key] = raw.slice(0, MAX_PROP_STRING);
    else if (typeof raw === 'boolean') props[key] = raw;
    else if (typeof raw === 'number' && Number.isFinite(raw)) props[key] = raw;
    else return null;
  }
  return JSON.stringify(props).length <= MAX_PROPS_BYTES ? props : null;
}

/**
 * The only thing kept from the user agent. Ordered checks: a tablet's agent
 * often also says "Mobile" (iPad Safari did for years), and Android tablets
 * are the Android agents that do *not* say Mobile.
 */
export function deviceTypeFrom(userAgent: string | undefined): 'mobile' | 'tablet' | 'desktop' {
  const ua = userAgent ?? '';
  if (/iPad|Tablet|PlayBook|Silk|Kindle|Android(?!.*Mobile)/i.test(ua)) return 'tablet';
  if (/Mobi|iPhone|iPod|Android|IEMobile|Opera Mini|BlackBerry/i.test(ua)) return 'mobile';
  return 'desktop';
}

/** Crawlers and link previewers announce themselves; their "visits" are not people. */
export function isBotUserAgent(userAgent: string | undefined): boolean {
  if (!userAgent) return true;
  return /bot|crawl|spider|slurp|facebookexternalhit|embedly|preview|lighthouse|headless|phantomjs|python-requests|curl\/|wget/i.test(
    userAgent,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
