# Main website (jsmf.me)

The public home of JSMF. Today it does one job: **sell seats at paid live
sessions with Dr. Angad Rai**. Design source: `web-main-design/`. Code:
`main-web/` (Next.js, port 3002).

---

## 1. Decisions

| Question | Decision | Why |
| :--- | :--- | :--- |
| Separate backend? | **No — same NestJS API**, new `events` module | Identity, Razorpay, webhooks, reconciliation, email, admin roles and audit already exist and are tested. A second backend would duplicate payment code — the riskiest code there is — and cost a second Cloud Run service. |
| Separate database? | **No — same Postgres**, two new tables | One `users` table means one account: someone who buys a seat and later a PDF is the same person, and the planner that comes with a seat appears in their store library. |
| Separate frontend? | **Yes — `main-web/`** | Different domain, different release timeline, and a change to the store must never break the site selling sessions (the same reasoning that split `pdf-web/` from `web/`). |
| Pricing | **Always paid** | Enforced by the API (`PAID`, price > 0). |
| Account | **An account is required before paying** | The free PDF is granted to that account's email, and the joining link is emailed there. The dialog says so before asking. The ways in are the same as the store — Google, email + password, and mobile when the server enables it — because identity is platform-wide and both sites sign into one account. |
| Joining link | **Email** — in the confirmation if already set, and in a **reminder** before the start | Reminders run on the existing 5-minute cron. |
| Resources / Browse pages from the design | **Not built** | Resources live on store.jsmf.me; "Explore resources" links there. |

---

## 2. Data model — reuse first, add only what a session alone has

A session is a **`products` row with `type = LIVE_SESSION`**. That is the whole
trick: orders, order items, payments, Razorpay, refunds, audit and entitlements
work unchanged — the schema was designed for new product types from day one.

What only a session has lives in four tables (migrations
`20260930150000_live_sessions` and `20261001120000_live_session_days`):

**`live_sessions`** — one row per session product, keyed by `product_id`.

| Column | Notes |
| :--- | :--- |
| `product_id` | PK, FK → products **RESTRICT** |
| `starts_at` | the **first day's** start — a copy the service writes in the same transaction as the days, so listing, ordering and "registration closes at the start" stay one indexed column |
| `platform_label` | display text ("Live on Zoom · Link sent on mail") |
| `capacity` | NULL = unlimited; CHECK > 0 |
| `join_url` | **private** — never in a public response; emailed to seat holders only |
| `recording_url` | shown publicly after the start |
| `highlights text[]` | "What you'll learn", in order — never queried, so an array, not a table |
| `perk_text` | the perk line in the card |

**`live_session_days`** — one row per day. A one-day session has one row; a
multi-day session one per day (up to 14). One seat covers every day, with the
same joining link.

| Column | Notes |
| :--- | :--- |
| `live_session_id` | FK → live_sessions **RESTRICT** |
| `starts_at`, `duration_minutes` | CHECK duration > 0. Days may not overlap — checked by the service, not a unique index, because postponing every day by one moves a day onto another's old time mid-save |

**`session_registrations`** — what the attendee told us, and what we sent them.

| Column | Notes |
| :--- | :--- |
| `live_session_id` | FK → live_sessions **RESTRICT** |
| `user_id` | FK → users **RESTRICT** (unique with session) |
| `whatsapp_number`, `exam`, `stage` | plain text; the options are a list in the API, so changing them is a deploy, never a migration |
| `order_id` | FK → orders **SET NULL** — latest checkout, for support |
| `confirmation_sent_at` | delivery bookkeeping |
| `attended_at` | reserved for attendance tracking later |

**`session_day_reminders`** — "this person was reminded about this day".

| Column | Notes |
| :--- | :--- |
| `registration_id`, `live_session_day_id` | composite PK — inserting the row *is* the claim, so overlapping sweeps can never double-send; both FKs **RESTRICT** |
| `sent_at` | when it went |

Deliberate choices:

- **"Has a seat" is not stored anywhere.** It is an ACTIVE entitlement on the
  session product, exactly like "owns this PDF". So a refund frees the seat by
  itself, seats taken are *counted*, and there is no flag that can disagree
  with the payment record. A registration row alone means "started checkout".
- **The planner uses the existing `product_bundle_items`** (session → PDF). On
  payment it is granted with source `BUNDLE` and the session order's id, so a
  refund takes it back too. A buyer who already owned the PDF keeps their copy.
- **No cascades.** Every FK is RESTRICT except the informational order link.
  A sold session is archived, never deleted.

**Adding things later** (webinar series, replays, attendance import, other
event types) means new rows or new tables beside these — not changes to
orders, payments or the tables above.

---

## 3. Flow

```
jsmf.me  →  Reserve  →  (not signed in) "Sign up is required" → Google or email → back, dialog reopens
         →  WhatsApp / exam / stage  →  POST /sessions/:id/register
         →  checks: published, not started, no seat yet, seats left
         →  saves answers, starts a normal order  →  Razorpay
         →  webhook (authoritative) or verify callback  →  settle:
               seat entitlement (PURCHASE) + planner (BUNDLE)
         →  OrderEvents "order paid"  →  session confirmation email
               (the generic "files in your library" receipt is skipped)
cron every 5 min  →  POST /internal/session-reminders
               →  reminder with the link, once per person per day, starting
                  SESSION_REMINDER_LEAD_MINUTES before each day ("Day 2 of 3")
```

- **Payment code does not know sessions exist.** Settlement announces "order
  paid" through `OrderEvents`; the events module listens. Dependencies point
  one way (events → orders).
- **Seats are checked at checkout, not held.** Two people can both pay for the
  last seat and both keep it — refusing a cleared payment is worse than one
  person over capacity.
- **Editing days.** The admin form sends every day on each save; an existing
  day keeps its row (and reminder history), a missing one is removed. Moving a
  day's start clears that day's reminders so a fresh one goes out for the new
  time. The confirmation email lists every day, but one already sent does not
  update itself if dates change later.
- **Reminders wait for a link.** A session with no `join_url` is skipped and
  retried every sweep until the start, so adding the link late still reaches
  everyone. Each reminder is claimed before sending, so overlapping sweeps
  cannot double-send.
- The generic `/orders` checkout refuses `LIVE_SESSION`, and the store's
  Browse, Featured, product page and Library all exclude it.

---

## 4. API

| Route | Auth | Purpose |
| :--- | :--- | :--- |
| `GET /sessions` | public | `{ upcoming, previous }` for the home page |
| `GET /sessions/registration-options` | public | exam / stage choices |
| `GET /sessions/:slug` | public | one session |
| `GET /sessions/:id/registration` | user | has a seat? saved answers |
| `POST /sessions/:id/register` | user | save answers, start Razorpay |
| `/admin/sessions` (CRUD, publish, unpublish, archive, `/:id/registrations`) | ADMIN, EDUCATOR | managed at **store.jsmf.me/admin/sessions** |
| `POST /internal/session-reminders` | Cloud Run IAM | reminder sweep |

---

## 5. Running and deploying

Local: `npm run docker:dev` → http://localhost:3002. Admin: http://localhost:3001/admin/sessions.

To go live (not done yet):

1. Deploy `main-web/` as its own Cloud Run service (same Dockerfile pattern as
   `pdf-web/`) with `BACKEND_API_URL`, `NEXT_PUBLIC_SITE_URL=https://jsmf.me`,
   `NEXT_PUBLIC_STORE_URL=https://store.jsmf.me`; map `jsmf.me` to it; grant its
   service account `roles/run.invoker` on the backend.
2. Backend env: add `https://jsmf.me` to `CORS_ORIGINS` and
   `https://jsmf.me/auth/callback` to `OAUTH_ALLOWED_REDIRECTS` (already listed
   in the docs). `GOOGLE_CALLBACK_URL` stays on store.jsmf.me — the OAuth state
   is a signed token, not a cookie, so starting on one domain and finishing via
   the other works.
3. Add a Cloud Scheduler job: `POST /api/internal/session-reminders` every 5
   minutes, same service account as the reconciliation job.
4. Optionally set `SESSION_REMINDER_LEAD_MINUTES` (default 60).

---

## 6. Verification

- 10 integration tests against Postgres (`live-session.integration.spec.ts`):
  publish without a file and no public join link; excluded from store and
  generic checkout; seat + planner granted with exactly one email; capacity
  refusal and refund freeing the seat; no-email account and post-start refused;
  reminders held until a link exists, then sent exactly once, never to unpaid
  registrations; multi-day days stored in order and all listed in the
  confirmation; overlapping days refused; one reminder per day, re-sent for a
  rescheduled day; postponing every day by one. Full backend suite: 104 passing.
- Driven in a real browser: home page desktop and mobile (no horizontal
  overflow), signed-out dialog, validation, signed-in form, and the real
  Razorpay test-mode window opening with ₹99. Admin create/edit/publish and the
  registrations table.
- Not driven: completing a Razorpay payment in the browser (settlement is
  covered by the tests), and a real Google sign-in round trip on port 3002.
