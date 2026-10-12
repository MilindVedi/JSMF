# Analytics — first-party website activity

What visitors do on the main website (jsmf.me): which pages they see, where
they came from, and how far they get toward a booked seat. Collected by JSMF
itself — no Google Analytics, no third-party script, no cookies — and shown on
the admin panel's **Analytics** page (`/admin/analytics` in pdf-web).

There are two separate sources of truth, and the admin page shows both:

| Source | What it is | Accurate? |
| :--- | :--- | :--- |
| `analytics_events` (this feature) | Browser events: page views, clicks, the payment window opening | Approximate — ad blockers, closed tabs and no-JS visitors are missed |
| `users`, `orders` (existing tables) | Accounts created, orders started and paid | Exact — the ledger |

Use the events for *behaviour* (where people drop off) and the tables for
*money and accounts*. "Paid (browser)" in the funnel will normally be a little
below "Paid orders" from the database; that gap is expected.

---

## 1. The one rule: analytics can never break the site

Every tracking call on the website is fire-and-forget:

- `track()` (main-web `src/lib/analytics.ts`) returns nothing, never throws
  (everything is in `try/catch`) and is never awaited by UI code. It only
  pushes onto an in-memory queue.
- The queue is sent in the background: 1 s after a page view, 5 s after other
  events, immediately for events that usually precede leaving the page
  (`book_click`, `signin_start`, `outbound_click`) via a `keepalive` fetch, and
  on `pagehide` / tab-hidden via `navigator.sendBeacon`. Nothing waits on any
  of these; a failed request is dropped, never retried.
- The endpoint always answers **204** — for bad input, unknown events, a
  database error, or when switched off. The only other answer is the
  throttler's 429, which the tracker ignores the same way.
- Outbound links are tracked by one passive document-level click listener; no
  link's `href`, `target` or click behaviour was changed.
- The queue is capped (100 events) so an unreachable endpoint cannot grow
  memory.

Verified (Playwright, local stack): with `/api/analytics/**` aborted, and with
it hanging for 20 s, every page, the Book button and the registration dialog
behaved exactly as normal, with no application errors. (Chrome itself prints
a "Failed to load resource" line in DevTools when the request is aborted —
that is the browser's own network log, invisible on the page.)

Successful analytics requests are **not** written to the API's request log
(`http.request`), to keep Cloud Logging volume down; failures (4xx/5xx) still
are.

## 2. What is tracked

| Event | Fires when | Props |
| :--- | :--- | :--- |
| `page_view` | First load of any page, and every client-side route change (`components/analytics-tracker.tsx`, mounted once in the root layout) | — |
| `book_click` | Any "Book Your Spot Now" button | `location`: `hero` · `session_card` · `cta` (home), `prep_kit_hero` · `session_card` (/prep-kit); `external: true` while `EXTERNAL_CHECKOUT_URL` sends people to a Razorpay Payment Page |
| `register_open` | The registration dialog opens | — |
| `register_step` | The dialog moves to a new step | `step`: `sign_in` · `form` · `already` · `done` · `pending` |
| `signin_start` | Google / email / mobile sign-in is started | `method`: `google` · `email` · `phone`; `from: "register"` in the dialog, or `mode: "login" \| "signup"` on the account pages |
| `checkout_open` | The Razorpay window opens (`use-session-checkout.ts`) | `kind: "stub"` on the dev stub driver |
| `checkout_dismiss` | The Razorpay window is closed without paying | `afterFailure`: whether an attempt had failed first |
| `payment_success` | Razorpay's success handler runs (or a free / stub booking succeeds) | `kind`: `free` · `stub` when not Razorpay |
| `payment_error` | Razorpay reports a failed attempt (`payment.failed`) | — |
| `contact_open` | The "Contact us" dialog opens | — |
| `outbound_click` | A link leaving the site is clicked | `target`: `youtube` · `telegram` · `instagram` · `store` · `razorpay` · `other` |

The server keeps an **allowlist** of these names
(`backend/src/modules/analytics/domain/analytics-event.ts`); anything else is
dropped. Adding an event = add it there and in the `AnalyticsEventName` type in
main-web.

Every event also carries: `path` (pathname only), `visitorId`, `sessionId`,
UTM tags if the session landed with them, and — on the first page view of a
page load only — the external referrer.

## 3. Privacy stance

- **No IP address and no user agent are stored.** The user agent is read once
  on the server to derive `device_type` (`mobile` / `tablet` / `desktop`) and
  discarded. (The API's ordinary request log is unchanged and separate.)
- **No cookies, no fingerprinting, no third parties.** `visitorId` is a random
  UUID the browser generates and keeps in `localStorage`
  (`jsmf.analytics.visitor`); clearing site data resets it. `sessionId` lives
  in `sessionStorage`, per tab, and rotates after 30 idle minutes.
- **No query strings.** Paths and referrers keep host + path only — a
  referrer's query is where other sites put search terms and ids.
- **Signed-in link only when already known.** If the page holds an access token
  in memory, the fetch sends it and the server links the event to that user
  (`user_id`, `ON DELETE SET NULL`). Unload beacons carry no token and stay
  anonymous. Authentication is never required.
- **Bots are skipped**: `navigator.webdriver` in the browser, and crawler user
  agents (`bot`, `crawl`, `spider`, `headless`, `lighthouse` …) on the server.
- `props` are a small flat object of strings/numbers/booleans (≤ 12 keys,
  ≤ 2 KB) — never personal data.
- The admin API returns only aggregates; no screen shows one visitor's trail.

The Privacy Policy should say this — see the sentence in §8.

## 4. Switches

| Variable | Where | Default | Effect |
| :--- | :--- | :--- | :--- |
| `ANALYTICS_ENABLED` | backend (Cloud Run env) | `true` | `false`: the endpoint still answers 204 but stores nothing. **The kill switch** — no rebuild, takes effect on the next revision. |
| `ANALYTICS_RATE_LIMIT_PER_MINUTE` | backend | `120` | Batches per caller (per account, or per IP when anonymous) per minute. Over it, batches are lost silently. |
| `NEXT_PUBLIC_ANALYTICS_ENABLED` | main-web, **build time** | unset = on | `"false"` removes tracking from the client bundle. Needs a rebuild (NEXT_PUBLIC values are inlined), so prefer the backend switch for a quick stop. No Dockerfile build arg is needed for the default. |

## 5. Endpoints

**`POST /api/analytics/events`** — public, `@SkipLegalCheck`, throttled.

```json
{
  "app": "MAIN",
  "events": [
    {
      "name": "page_view",
      "path": "/prep-kit",
      "referrer": "www.google.com/search",
      "utm": { "source": "telegram", "medium": "social", "campaign": "oct" },
      "props": { "location": "hero" },
      "visitorId": "0b9d…-uuid",
      "sessionId": "f3c1a9…",
      "at": "2026-10-11T10:00:00.000Z"
    }
  ]
}
```

Accepts `application/json` or `text/plain` (a JSON string — what sendBeacon
sends without a CORS preflight; the tracker uses it for every request). Max
20 events per request (extra ones ignored), 32 KB body. Each event is
validated on its own and dropped if bad. `app` defaults to `MAIN`; `STORE` and
`PYQ` are accepted for when those apps adopt the tracker. `at` is accepted but
**ignored** — `occurred_at` is always server time. Always `204`.

main-web reaches it through its own `/api` proxy (`src/middleware.ts`), so it
is same-origin; nothing extra is needed for CORS.

**`GET /api/admin/analytics/summary?from=YYYY-MM-DD&to=YYYY-MM-DD&app=MAIN`** —
ADMIN only. Dates are inclusive India-time days; default the last 14 days, at
most 180. Returns totals, daily unique visitors and page views, the funnel
(unique visitors per step), server truth (users created; orders created, paid
and paid amount — for `MAIN`, orders containing a live session; for other apps,
orders for every other product type), top 10 pages, referrer hosts and UTM
sources, and the device split.

## 6. Reading the admin page

- **Visitors** — distinct `visitorId`s with any event. One person on two
  devices counts twice; someone clearing storage counts again.
- **Visits** — distinct tab sessions.
- **Accounts created / Paid orders** — from `users` and `orders`, exact.
- **Visitor → paid** — paid orders ÷ visitors, the headline conversion rate.
- **Booking funnel** — of everyone who visited, how many clicked Book, opened
  registration, opened the payment window, and paid; each percentage is of the
  step above, so the biggest drop is the step to work on. The server-truth
  orders line under the heading is the number to trust for revenue.
- **Top referrers** — sites (by host) that sent visitors. Telegram and
  Instagram apps often strip the referrer, so share **UTM-tagged links**
  (`https://jsmf.me/?utm_source=telegram&utm_medium=social&utm_campaign=oct-session`)
  to see them under *Campaigns*.

## 7. Data model

`analytics_events` (schema `public`, migration
`20261011160000_analytics_events`, additive only):

| Column | Type | Notes |
| :--- | :--- | :--- |
| `id` | uuid (v7) | |
| `app` | `JsmfApp` enum | `MAIN` / `STORE` / `PYQ` (existing enum, reused) |
| `name` | varchar(64) | allowlisted |
| `visitor_id` | uuid | browser-generated |
| `session_id` | varchar(64) | per tab |
| `user_id` | uuid null | FK `users`, `ON DELETE SET NULL` |
| `path` | varchar(512) | pathname only |
| `referrer` | varchar(512) null | host + path |
| `utm_source` / `utm_medium` / `utm_campaign` | varchar(128) null | |
| `props` | jsonb null | ≤ 2 KB |
| `device_type` | varchar(16) | mobile / tablet / desktop |
| `occurred_at` | timestamptz | server time, default `now()` |

Indexes: `(app, occurred_at)`, `(app, name, occurred_at)`, `(visitor_id)`.

Growth: a few rows per visitor. At 10k visitors/month that is roughly 50k
rows/month — trivial for Postgres. If it ever matters, delete rows older than
a year (`DELETE FROM analytics_events WHERE occurred_at < now() - interval '1 year'`)
— nothing references them.

## 8. Privacy Policy sentence

Legal text lives in the database; add this through **Admin → Legal → Privacy
Policy** (a MINOR change is enough — it describes existing practice more
precisely and takes nothing away):

> To understand how our website is used and improve it, we record basic usage
> events — such as the pages you visit, the buttons you click and how you
> arrived (for example, the referring website or campaign link) — together
> with a random identifier stored in your browser and your device type (mobile,
> tablet or desktop). We do not store your IP address or full browser details
> with these events, we do not use third-party analytics or advertising
> trackers, and if you are signed in the events may be linked to your account.
> You can reset the identifier at any time by clearing this site's data in your
> browser.

## 9. The other half: backend activity logs in Cloud Logging

The analytics table answers "what did visitors do in the browser". The API's
structured logs answer "what did the server do" — accounts, checkouts,
payments — one JSON line per event with `jsonPayload.activity`. Full list and
fields: [main website §8](../main-website/README.md#8-logging-and-monitoring).

In **Cloud Console → Logging → Logs Explorer** (service `jsmf-backend`):

```
# New accounts
resource.labels.service_name="jsmf-backend"
jsonPayload.activity="auth.signup"

# Checkouts started (a Razorpay order was created)
resource.labels.service_name="jsmf-backend"
jsonPayload.activity="checkout.started"

# Payments settled — first settlement only, i.e. real sales
resource.labels.service_name="jsmf-backend"
jsonPayload.activity="payment.settled"
jsonPayload.firstSettlement=true

# Everything one person did (from the user id)
jsonPayload.userId="<user id>"

# Analytics batches that failed to store (should be empty)
resource.labels.service_name="jsmf-backend"
jsonPayload.activity="analytics.ingest_failed"
```

From a terminal:

```
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="jsmf-backend" AND jsonPayload.activity="payment.settled"' --freshness=7d --limit=50 --format='table(timestamp, jsonPayload.orderNumber, jsonPayload.amountMinor, jsonPayload.via)'
```

Comparing the two: `checkout_open` events in the funnel should roughly match
`checkout.started` log lines, and `payment_success` should roughly match
`payment.settled` with `firstSettlement=true` — a large gap means the browser
side is losing events (or people are paying on another device).
