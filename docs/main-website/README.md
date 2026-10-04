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
| Session dates | **Optional** — a session can be published with no days at all | Lets the admin open registration before the schedule is fixed. The website shows **"Date to be announced"** / **"Time to be announced"** wherever a date would go, and registration stays open (nothing has started yet). Telling existing buyers once dates are set is a **deliberate admin action** — see §3d. |
| Admin-triggered refunds | **Disabled by default** (`REFUNDS_ENABLED=false`) | The real Razorpay integration is new; this gates only the *admin dashboard* "Refund" button/endpoint, which moves money through Razorpay's API. A refund issued directly in the **Razorpay dashboard** still revokes the buyer's access automatically — see §3a. |
| The included PDF | **Delivery timing is per-session, admin-chosen** (`IMMEDIATE` \| `AUTO_AFTER_SESSION` \| `MANUAL`) | Lets seats go on sale before the PDF is finished — see §3b. |
| Seat-count visibility | **Admin toggle**, `showSeats` | Off hides both `seatsRemaining` and the temporary `displaySeats` number from every public response, without touching the underlying numbers. |
| "Check your spam folder" note | **One platform-wide admin toggle** (`PlatformSettings.showSpamFolderNote`) | Shown wherever a verification email or Google sign-in is offered, on **both** jsmf.me and store.jsmf.me — see §7. |

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
| `starts_at` | the **first day's** start — a copy the service writes in the same transaction as the days, so listing, ordering and "registration closes at the start" stay one indexed column. **Nullable**: a session with no days yet (`days: []`) has `starts_at = NULL`, the website shows "Date to be announced", and registration stays open because nothing has started. `ORDER BY starts_at NULLS LAST` keeps undated sessions from sorting as if overdue. |
| `platform_label` | display text ("Live on Zoom · Link sent on mail") |
| `capacity` | NULL = unlimited; CHECK > 0 |
| `show_seats` | admin toggle; when `false`, both `seatsRemaining` and `displaySeats` are nulled out of every public response |
| `display_seats` | **temporary**, external-checkout-phase-only scarcity number (§3c). NULL = no line, 0 = fully booked. Not derived from entitlements. |
| `join_url` | **private** — never in a public response; emailed to seat holders only |
| `recording_url` | shown publicly after the start |
| `highlights text[]` | "What you'll learn", in order — never queried, so an array, not a table |
| `perk_text` | the perk line in the card |
| `audience_text` | **"Who is this session for?"** — one admin-written paragraph. NULL hides the section entirely rather than printing an empty heading. |
| `testimonials_heading`, `testimonials_subheading` | Section heading and subheading (§3e). Both fall back to generic copy when NULL, so the section reads sensibly the moment the first screenshot is added, with nothing to fill in first. |
| `testimonials_tag` | The small label to the right of the heading. **No fallback** — NULL hides it entirely, because an empty tag with a dangling border reads as broken, not minimal. |
| `bundle_delivery_mode` | `IMMEDIATE` (default) \| `AUTO_AFTER_SESSION` \| `MANUAL` — see §3b |

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
| `whatsapp_number` | **nullable** contact number, 10-digit Indian mobile, no country code. Briefly dropped from the form and the column made optional at the same time; re-added to the form afterwards (now required there again, with the same 10-digit validation client- and server-side) — nullable because nothing sends WhatsApp or SMS to it, so it is a contact number on file, never a delivery channel. |
| `exam`, `stage` | plain text; the options are a list in the API (`GET /sessions/registration-options`), so changing them is a deploy, never a migration. Current exam options: `NEET-PG`, `INI-CET`, `FMGE` ("MBBS Professional" removed). Current stage options: `1st / 2nd year`, `3rd year`, `Final year`, `Intern` ("Repeater" removed). |
| `order_id` | FK → orders **SET NULL** — latest checkout, for support |
| `confirmation_sent_at` | delivery bookkeeping |
| `attended_at` | reserved for attendance tracking later |

**`session_day_reminders`** — "this person was reminded about this day".

| Column | Notes |
| :--- | :--- |
| `registration_id`, `live_session_day_id` | composite PK — inserting the row *is* the claim, so overlapping sweeps can never double-send; both FKs **RESTRICT** |
| `sent_at` | when it went |

**`session_bundle_deliveries`** — one row per seat holder, for sessions whose
included material is held back (`bundle_delivery_mode != IMMEDIATE`). See §3b.

| Column | Notes |
| :--- | :--- |
| `live_session_id`, `user_id` | FKs **RESTRICT**; `@@unique([liveSessionId, userId])` — never returns to `PENDING` once `SENT`, so "send to everyone not yet sent" can never deliver twice |
| `status` | `PENDING` (default) \| `SENT` \| `FAILED` |
| `last_error` | why the last attempt failed; cleared on a successful send |
| `attempts` | incremented on every try, success or failure |
| `sent_at` | set once, on the successful send |

**`session_date_announcements`** — one row per seat holder told that a
session's dates are confirmed. Admin-triggered only. See §3d.

| Column | Notes |
| :--- | :--- |
| `live_session_id`, `user_id` | FKs **RESTRICT**; `@@unique([liveSessionId, userId])` |
| `status` | `PENDING` (default) \| `SENT` \| `FAILED` |
| `announced_starts_at` | the first-day start this buyer was told about. When the session is rescheduled this stops matching, which is what makes everyone sendable again without a second table |
| `last_error`, `attempts`, `sent_at` | as `session_bundle_deliveries` above |

**`session_testimonials`** — screenshots of what past attendees said, shown on
the session page. See §3e.

| Column | Notes |
| :--- | :--- |
| `live_session_id` | FK → live_sessions **RESTRICT** |
| `storage_provider`, `bucket`, `object_key`, `mime_type`, `size_bytes` | the storage-port reference, same pattern as a product asset |
| `sort_order` | display order; new uploads go to the end; admin-reorderable (`PATCH …/testimonials/reorder`) |
| `uploaded_by_id` | FK → users |
| On delete | **Cascade** — a testimonial image is not a sales record; removing the session should not be blocked by its marketing screenshots. The only exception to this module's otherwise-RESTRICT-everywhere rule. |

**`platform_settings`** — not scoped to a session; one fixed row (`id = 'global'`)
of site-wide toggles shared by jsmf.me **and** store.jsmf.me. See §7.

Deliberate choices:

- **"Has a seat" is not stored anywhere.** It is an ACTIVE entitlement on the
  session product, exactly like "owns this PDF". So a refund frees the seat by
  itself, seats taken are *counted*, and there is no flag that can disagree
  with the payment record. A registration row alone means "started checkout".
- **The planner uses the existing `product_bundle_items`** (session → PDF). In
  `bundle_delivery_mode = IMMEDIATE` (the default) it is granted with source
  `BUNDLE` and the session order's id at payment, so a refund takes it back
  too, and a buyer who already owned the PDF keeps their copy. The other two
  modes hold this grant back entirely until released later — see §3b.
- **No cascades.** Every FK is RESTRICT except the informational order link.
  A sold session is archived, never deleted.

**Adding things later** (webinar series, replays, attendance import, other
event types) means new rows or new tables beside these — not changes to
orders, payments or the tables above.

---

## 3. Flow

The registration popup's recommended, and now only inline, sign-in path is
Google ("RECOMMENDED" badge); email sign-up is still reachable one tap below
it, never removed. Signing in with Google returns to whichever page the
dialog was opened from (home page or `/prep-kit`) with `?register=1`, which
reopens the dialog rather than dropping the person on the home page.

```
jsmf.me  →  Book My Spot  →  (not signed in) Google (recommended) or email → back, dialog reopens
         →  mobile number (10-digit, required) / exam / stage  →  POST /sessions/:id/register
         →  checks: published, not started, no seat yet, seats left
         →  saves answers, starts a normal order  →  real Razorpay checkout.js
               (prefilled name, email, and the mobile number just entered)
         →  webhook (authoritative) or verify callback  →  settle:
               seat entitlement (PURCHASE) + planner (BUNDLE, IMMEDIATE mode only — §3b)
         →  OrderEvents "order paid"  →  session confirmation email
               (the generic "files in your library" receipt is skipped)
cron every 5 min  →  POST /internal/session-reminders
               →  reminder with the link, once per person per day, starting
                  SESSION_REMINDER_LEAD_MINUTES before each day ("Day 2 of 3")
               →  also sweeps AUTO_AFTER_SESSION bundle releases (§3b)
```

- **Payment code does not know sessions exist.** Settlement announces "order
  paid" through `OrderEvents`; the events module listens. Dependencies point
  one way (events → orders).
- **Seats are checked at checkout, not held.** Two people can both pay for the
  last seat and both keep it — refusing a cleared payment is worse than one
  person over capacity.
- **Editing days.** The admin form sends every day on each save; an existing
  day keeps its row (and reminder history), a missing one is removed. Saving
  with **zero days** is valid — the session goes back to "dates to be
  announced", `starts_at` is cleared, and registration stays open. Moving a
  day's start clears that day's reminders so a fresh one goes out for the new
  time. The confirmation email lists every day, but one already sent does not
  update itself if dates change later — **saving dates emails nobody**, which
  is what §3d exists to do.
- **Reminders wait for a link.** A session with no `join_url` is skipped and
  retried every sweep until the start, so adding the link late still reaches
  everyone. Each reminder is claimed before sending, so overlapping sweeps
  cannot double-send.
- The generic `/orders` checkout refuses `LIVE_SESSION`, and the store's
  Browse, Featured, product page and Library all exclude it.

---

## 3a. Real Razorpay checkout, and what a dashboard refund does

The Payment Page bypass in §3b was the launch-day workaround for Razorpay
reviewing the account; the real integration (`checkout.js`, webhook-settled,
reconciliation-swept) described in §3 above is what every registration uses
once `EXTERNAL_CHECKOUT_URL` is unset.

**Admin-triggered refunds are off by default** (`REFUNDS_ENABLED=false`):
`POST /admin/orders/:id/refund` answers `409` without touching Razorpay, and
the pdf-web admin Orders page shows its Refund button disabled with that
reason. This gates only the path that calls Razorpay's refund API and moves
money — the functionality is intact, just switched off while the real
payment flow is new. Flip the env var to `true` once that path has been
exercised and is wanted again — the admin Orders page reads `refundsEnabled`
from `GET /admin/settings`, so there is no frontend constant to keep in sync.

**A refund issued directly in the Razorpay dashboard is never gated.** The
`refund.processed` webhook is handled either way (`applyProviderRefund` in
`payment.service.ts`): it records a `Refund` row keyed on the provider's
unique refund id (so a redelivered webhook is a no-op), and revokes the
buyer's entitlement — **but only once the refunded amount reaches the full
payment amount**. A partial refund (its own `refundAmountMinor`, read
separately from the payment's amount on the webhook payload — Razorpay's
`refund.processed` event carries both entities) is recorded and left alone;
access is removed only when everything paid has come back. This is on top of,
not instead of, the existing admin-initiated refund path (`PaymentService.refund()`,
documented in `docs/pdf-platform/02-architecture.md` §"Status: built — admin
order management and refunds") — both ultimately call the same revocation.

**Go-live hardening (reviewed and tested before launch).** Each of these was
a way a buyer could pay and not get their seat, or get a wrong email:

| Situation | Behaviour |
| :--- | :--- |
| Webhook processing fails once (DB blip, redeploy mid-request) | The event row is marked `FAILED` and Razorpay's redelivery of the same event id **reprocesses** it. Only a `PROCESSED` event is treated as a duplicate. (Previously every redelivery was answered "duplicate", so one transient failure stranded the payment.) |
| Webhook and browser callback settle the same order at the same instant | The order's move to `PAID` is a conditional update; only the call that actually flips it sends the confirmation. Exactly one email. |
| First attempt fails, buyer retries in the same Razorpay window and pays | `payment.failed` marks the order `FAILED` but it is not final: the capture moves it to `PAID`. A `payment.failed` arriving *after* a capture cannot undo it. Reconciliation now also checks `FAILED` orders, so if the retry's capture webhook is lost too, the sweep still settles it. The checkout dialog no longer shows "payment did not go through" while Razorpay's window is still open for the retry. |
| A capture event replayed after a refund | Ignored — never flips a refunded payment back to captured or re-grants access. |
| Payment Page / payment-link payments on the same Razorpay account | Their webhooks arrive too (no `jsmf_order_id` in notes). They are acknowledged with 200 and logged as `webhook.foreign_payment_ignored` / `webhook.foreign_refund_ignored`, never failed — repeated 5xx responses can get Razorpay to disable the whole webhook. |
| Session sold with the PDF delivered later (`MANUAL` / `AUTO_AFTER_SESSION`) | The seat confirmation no longer says the PDF is "already in your JSMF library" — it is announced separately when released. |
| Buyer returns after abandoning payment | The saved mobile number (stored as `91XXXXXXXXXX`) is pre-filled in its 10-digit form, so the form does not reject a number they never typed. |

All of the above are covered by tests in `payment.integration.spec.ts`
("go-live hardening") and `live-session.integration.spec.ts`. The full flow
was also run end to end against Razorpay **test mode** through the main-web
`/api` proxy: sign-up → register → real Razorpay order (amount, receipt and
`jsmf_order_id` verified at Razorpay) → forged webhook rejected (400) → bad
checkout signature rejected (400) → genuinely signed capture webhook through
the proxy settled (200, HMAC survived the proxy byte-for-byte) → redelivery
answered as duplicate → browser verify idempotent → second booking refused
(409) → foreign capture acknowledged (200); order `PAID`, payment `CAPTURED`
with method and payment id, seat entitlement `ACTIVE`, registration linked to
the order, confirmation email sent.

---

## 3b. Temporary: selling through a Razorpay Payment Page

While the switch is on, session cards show the date and time as **To be announced** (it isn't final yet), the opening CTA reads **Book Your Spot Now**, and seat counts are hidden. `/prep-kit` reuses the home page's portrait card (`DoctorPortrait`) and session card (`SessionCard`) and shows the floating video too. (The *in-dialog* submit button, reached only in the real flow below, is a separate piece of copy — currently **"Book My Spot"**, no price shown.)

Razorpay will not issue API keys for a website until that website passes
review, but a **Payment Page** is hosted on `rzp.io` and works immediately. So
seats can be sold before the integration is approved.

Switched on with one environment variable on `main-web`:

```
EXTERNAL_CHECKOUT_URL=https://rzp.io/rzp/<your-page>
```

| Empty (the default) | Set |
| :--- | :--- |
| The real flow: sign in, answer three questions, pay in-app, seat + planner granted, confirmation and reminder emails sent. | Every Reserve button opens the Razorpay page instead. `/prep-kit` becomes a shareable page for Telegram, and Razorpay returns people to `/booking-success`. |

Read **server-side** and passed down as a prop, deliberately: a `NEXT_PUBLIC_`
value is inlined into the client bundle at build time, so switching it would
need a rebuilt image rather than an environment change.

**What this route does not do.** Nothing is recorded here — no account, no
order, no entitlement, no email, and the seat count cannot move, so the
"seats remaining" line and the registration dialog are hidden while it is on.
The attendee list lives in the Razorpay dashboard and is fulfilled by hand.
`/booking-success` grants nothing and is `noindex`: anyone can open that URL,
so it is a thank-you message only, never proof of payment.

**Turning it off is the whole exit plan.** Clear the variable and the real flow
returns unchanged — nothing was removed to make room for this. Delete
`src/lib/external-checkout.ts`, `/prep-kit` and `/booking-success` once the site is
approved.

Add the same custom fields on the Razorpay page that the real form collects
(name, email, mobile number, exam, stage), and set its redirect URL to
`https://jsmf.me/booking-success`. The price and title on that page are a
second copy of what the admin panel holds — change one and the other does not
follow.

### Bringing Payment Page buyers into the platform

Everyone who bought through the Payment Page is invisible to the platform —
no account, no order, no entitlement — so the seat count, the day reminder, the
"Notify attendees" send and the bundled PDF all pass them by. `npm run
db:backfill:session-buyers` (`backend/prisma/backfill-session-buyers.ts`) writes
them in as ordinary buyers: user, PAID order and item, CAPTURED payment, ACTIVE
`PURCHASE` entitlement, and a session registration.

```
npm run db:backfill:session-buyers -- --session <product-slug> --file buyers.json
npm run db:backfill:session-buyers -- --session <product-slug> --file buyers.json --commit
```

Dry run is the default; nothing is written without `--commit`. Re-running is
safe — anyone already holding an active seat is skipped whole, so a partial run
is simply run again. It sends no email: these people were confirmed by hand when
they paid, and a confirmation weeks later reads as a second charge.
`confirmationSentAt` is set for the same reason.

Three details that decide whether it works:

- **The registration row is not optional.** The entitlement alone covers the
  seat count, the date announcement and the bundled PDF — but the day reminder
  query (`sendDueReminders`) reads `sessionRegistration` joined to an active
  entitlement, so an entitlement-only backfill would silently drop these buyers
  from the one email that carries the joining link. This was confirmed against
  a real database, not reasoned about: with both rows present they appear in all
  four queries.
- **The email must be the one they will sign in with.** Google sign-in attaches
  to an existing account by email only when Google says the address is verified;
  a buyer who signs in with a different address gets a second, empty account and
  no seat. Confirm the addresses with each buyer rather than assuming the one
  they typed on the Razorpay page.
- **`users.phone` is deliberately left unset.** It is `UNIQUE`, and every path
  that writes it verifies it first; an unverified number there would block the
  real owner from claiming it later. The number goes on the registration's
  `whatsappNumber`, which is explicitly a contact number on file.

`exam` and `stage` are required columns with no sensible default, so they are
required per buyer in the input file and validated against `EXAM_OPTIONS` /
`STAGE_OPTIONS` before anything is written. Ask the buyers, or use what the
Razorpay page's custom fields captured.

---

## 3c. Deferred delivery of the included PDF

The admin picker for "included with a seat" only lists `PUBLISHED` products,
so a PDF still being written simply cannot be linked — but that alone only
stops *new* buyers from getting nothing; it does nothing for people who paid
*before* the PDF existed once the admin links it later (settlement runs once,
at each individual payment). `bundle_delivery_mode` on the session solves
this by deciding *when* the included grant happens at all, separately for
every session:

| Mode | Behaviour |
| :--- | :--- |
| `IMMEDIATE` (default) | Granted + emailed at payment, exactly as before this existed. |
| `AUTO_AFTER_SESSION` | Held back at payment. Released automatically, for every seat holder at once, once the session's last day has passed **and** the included item is `PUBLISHED` — on the same 5-minute reminder sweep, no new Cloud Scheduler job. |
| `MANUAL` | Held back at payment. Released only when an admin clicks send, per buyer or in bulk, from a delivery table on the session's admin page. |

One method, `LiveSessionNotifications.releaseBundle(sessionId, { userIds? })`,
is the single code path for all three callers (the sweep, "send to all
pending", and a single/bulk admin send) — `userIds` omitted means "everyone
whose row is not yet `SENT`", which is simultaneously "send to all pending"
and "retry every failure", and inherently can never deliver to the same
person twice (the unique `[liveSessionId, userId]` row on
`session_bundle_deliveries`, §2, never returns to `PENDING` once `SENT`).
Releasing is refused — with a message the admin UI shows verbatim — while the
session has not ended yet or nothing included is published yet.

The seat (`PURCHASE` entitlement) is **always** granted at payment, in every
mode; only the bundled extras are deferred. Refund behaviour is unchanged
either way — a grant made later still carries `sourceOrderId`, so
`revokeForOrder` still takes it back.

API: `GET /admin/sessions/:id/bundle-deliveries` (every seat holder's
PENDING/SENT/FAILED status, the failure reason, and whether sending is
currently possible), `POST /admin/sessions/:id/bundle-deliveries/send` with an
optional `userIds` body.

---

## 3d. Announcing dates to people who already bought

A session can be sold before its dates exist (§1). Nothing about saving those
dates later emails the buyers: `LiveSessionService.update()` sends no mail and
raises no event, by design. Without a deliberate step, the first a buyer hears
of the schedule is the ordinary "Starting soon" reminder, an hour before it
begins — too late for something they booked weeks earlier.

So announcing is an **explicit admin action**: a *Notify attendees* card on the
session's admin page, modelled on the bundle-delivery table above (§3c).
Pressing it emails every seat holder the confirmed dates
(`liveSessionDatesAnnounced`, tag `session-dates-announced`), and records the
outcome per buyer in **`session_date_announcements`** — PENDING / SENT /
FAILED with the reason, so a bad address is visible and retryable rather than
lost in a log.

The row also stores `announced_starts_at`: the first-day start that buyer was
told about. That one column is what makes a **reschedule** work without a
second table — when the dates move, every row's `announced_starts_at` no
longer matches the session, so those buyers show as PENDING again and the same
button tells them the new time. Someone already told the *current* dates is
always skipped, so the button is safe to press repeatedly.

Sending is refused, with a message the UI shows verbatim, while the session has
no dates at all.

The admin form says so where the dates are edited ("Saving a date does not
email existing attendees"), because the failure mode here is an admin assuming
it was handled.

API: `GET /admin/sessions/:id/date-announcements`,
`POST /admin/sessions/:id/date-announcements/send` with an optional `userIds`
body (omit it for everyone not yet told the current dates, which also retries
failures). Log line: `session.dates_announced`.

**Not covered:** a date set in the past, or one starting before the next
5-minute sweep, still produces no automatic reminder — `startsAt: { gt: now }`
excludes it and nothing backfills. Accepted deliberately; the announcement
email above is unaffected and still goes out.

---

## 3e. Testimonials

Screenshots of what past attendees said, shown on the home page (between the
upcoming-session section and About Dr. Angad) and on `/prep-kit` (after "The
strategy behind the preparation"). Rendered through one shared component
(`main-web/src/components/testimonials-section.tsx`) used by both pages —
one implementation, one place to style, one visual contract. The section
renders nothing at all when the upcoming session has no testimonials, so
the import is safe to leave in regardless. A horizontally-scrolling row of
cards (a quote-mark icon framing each screenshot; the first card accented).
Each card is itself the preview trigger — hover shows an eye icon with a
"Preview" label — and opens the lightbox at that image. A dashed "View all"
tile at the end opens the lightbox at the first image **only when there is
more than one testimonial** (a single-card row would make "View all · 1
testimonial" redundant). The lightbox shows one at a time with keyboard
(←/→/Esc), on-screen prev/next buttons, and a dot strip for touch.

Uploaded through the admin page per session (`POST
/admin/sessions/:id/testimonials`, multipart, PNG/JPEG/WebP up to 8 MB;
`DELETE .../testimonials/:testimonialId` also deletes the stored file, not
just the row) into their own `session_testimonials` table (§2) — a dedicated
table because `product_assets_current_unique` allows only one *current* asset
per kind, and these are an ordered *list*, not a single current file.
Public-bucket, like a cover image: this is marketing, shown to people who have
not paid, so it must not need a signed URL. Reorderable from the admin page
(drag via the up/down controls on hover; `PATCH
/admin/sessions/:id/testimonials/reorder` takes every testimonial id for that
session, once each, in the new order — rejected if the list does not exactly
match, so a partial reorder from a stale page can never silently drop one).

The section's heading, subheading, and the small tag label on the right are
each admin-editable per session (`testimonials_heading`,
`testimonials_subheading`, `testimonials_tag`), all optional. The heading and
subheading fall back to generic copy when unset, so a session shows something
reasonable the moment its first screenshot is added. The tag has no fallback
and is simply left out when unset — an empty "chip" with a dangling border
reads as broken decoration, not as deliberate restraint. The section itself
is hidden entirely when a session has no testimonials.

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
| `GET /admin/sessions/:id/bundle-deliveries`, `POST …/bundle-deliveries/send` | ADMIN, EDUCATOR | §3c |
| `GET /admin/sessions/:id/date-announcements`, `POST …/date-announcements/send` | ADMIN, EDUCATOR | §3d |
| `POST /admin/sessions/:id/testimonials`, `PATCH …/testimonials/reorder`, `DELETE …/testimonials/:testimonialId` | ADMIN, EDUCATOR | §3e |
| `POST /internal/session-reminders` | Cloud Run IAM | reminder sweep (reminders **and** the `AUTO_AFTER_SESSION` bundle sweep, §3c) |
| `GET /settings` | public | `{ showSpamFolderNote }` — read by both jsmf.me and store.jsmf.me, §7 |
| `GET /admin/settings`, `PATCH /admin/settings` | ADMIN | §7 |

---

## 5. Running and deploying

Local: `npm run docker:dev` → http://localhost:3002. Admin: http://localhost:3001/admin/sessions (Sessions) and /admin/settings (platform-wide toggles, §7).

**Going live on real Razorpay** (replacing §3b, in this order): swap the three
Razorpay secrets to live keys → point the webhook at
`https://jsmf.me/api/webhooks/razorpay` for `payment.captured`,
`payment.failed`, `refund.processed`, and send a test event expecting `200`
— a `400` or `403` means it never reached the app (checked empirically: a
public-domain curl that reaches NestJS returns `400` on a bad signature,
one hitting the backend's own Cloud Run URL returns `403`, IAM-blocked, which
is the actual routing constraint a webhook must avoid) → confirm payment
capture is set to **Automatic** in the Razorpay dashboard (the code only
grants on `payment.captured`; Authorized-only holds money without delivering
anything) → redeploy the backend → commit and push → **last**, remove
`EXTERNAL_CHECKOUT_URL` from `main-web`'s Cloud Run env vars → do one real
payment and one dashboard refund as a live test (§3a).

**Rehearse on Test mode, not on Live.** Razorpay keeps separate keys *and*
separate webhooks per mode, so a test-mode webhook tunnelled to a laptop
(`cloudflared tunnel --url http://localhost:4000`) can take as many payments as
you like with no real money and no crossover. Pointing a **second live-mode**
webhook at a laptop looks equivalent and is not: every live webhook receives
every live event, so the laptop would receive real buyers' payments (their
details, in a local log), and the laptop's own test payments would be delivered
to production — where `ensurePaymentRecord` reads a `jsmf_order_id` that exists
only locally, fails, and writes a `FAILED` row into `payment_webhook_events`.
That table is where a genuinely lost payment would show up, so it is the one
place not to leave false entries. It also puts live API keys on a laptop and
needs the webhook URL re-edited each time the tunnel restarts. Keep the live
account for the single end-to-end payment after deploying.

`main-web` is deployed (as `jsmf-web-main`, its own Cloud Run service):

1. Its own Cloud Run service (same Dockerfile pattern as `pdf-web/`) with
   `BACKEND_API_URL`, `NEXT_PUBLIC_SITE_URL=https://jsmf.me`,
   `NEXT_PUBLIC_STORE_URL=https://store.jsmf.me`; `jsmf.me` mapped to it; its
   service account granted `roles/run.invoker` on the backend.
2. Backend env: `https://jsmf.me` in `CORS_ORIGINS` and
   `https://jsmf.me/auth/callback` in `OAUTH_ALLOWED_REDIRECTS`.
   `GOOGLE_CALLBACK_URL` stays on store.jsmf.me — the OAuth state is a signed
   token, not a cookie, so starting on one domain and finishing via the other
   works.
3. A Cloud Scheduler job: `POST /api/internal/session-reminders` every 5
   minutes, same service account as the reconciliation job.
4. Optionally set `SESSION_REMINDER_LEAD_MINUTES` (default 60).

Still outstanding: the real-Razorpay go-live runbook above — as of this
writing, prod is still running on **test** Razorpay keys with
`EXTERNAL_CHECKOUT_URL` set (§3b), both steps still to be done.

---

## 6. Verification

- Integration tests against Postgres (`live-session.integration.spec.ts`):
  publish without a file and no public join link; excluded from store and
  generic checkout; seat + planner granted with exactly one email; capacity
  refusal and refund freeing the seat; no-email account and post-start
  refused; reminders held until a link exists, then sent exactly once, never
  to unpaid registrations; multi-day days stored in order and all listed in
  the confirmation; overlapping days refused; one reminder per day, re-sent
  for a rescheduled day; postponing every day by one; an undated session;
  manual bundle release with no double-send; a dashboard refund revoking a
  deferred-then-released grant; the confirmation naming the PDF only when it
  was actually granted; announcing dates to a buyer who bought while undated —
  saving the date emails nobody, the button sends once, a repeat press sends
  nothing, and a reschedule makes them sendable again (§3d). Plus the go-live
  hardening tests in §3a. Full backend suite: **154 passing** across 14 suites.
- Driven in a real browser: home page desktop and mobile (no horizontal
  overflow), signed-out dialog, validation, signed-in form, and the real
  Razorpay test-mode window opening with ₹99. Admin create/edit/publish, the
  registrations table, the bundle-delivery table, and testimonial
  upload/reorder/remove.
- Not driven: the *Notify attendees* card (§3d) — backend covered by the
  integration test above, but the admin UI itself has only been typechecked
  and linted, not clicked; completing a Razorpay payment in the browser
  (settlement is covered by the tests), a real Google sign-in round trip on
  port 3002, and a real webhook delivery against live keys (§3a/§5 — the curl check only proves
  the event *reaches* the app, not that live keys and a real signature work
  end to end).

---

## 7. Platform settings (cross-app, not session-scoped)

A few toggles apply to **both** jsmf.me and store.jsmf.me at once and have
nothing to do with any one session or product — these live on
`platform_settings` (§2), a single fixed row (`id = 'global'`), not a
key/value table: there are only a handful of these, each with its own type,
and a row per toggle would just move the "does it exist yet" problem into
every reader instead of solving it once. Managed from **one** admin page,
`pdf-web`'s `/admin/settings` (`GET /admin/settings`, `PATCH /admin/settings`,
`ADMIN` role), and read publicly and anonymously (`GET /settings`, no auth —
needed before anyone has signed in) by both frontends.

**`showSpamFolderNote`** (default `true`) — shows a "check your spam or
promotions folder" line wherever a verification email or Google sign-in is
offered: the OTP-code screen on both apps, the sign-up/sign-in page and the
session booking card on jsmf.me. Off hides it in every one of those places at
once, with no per-page override. Each spot reads it through a tiny shared
hook (`use-platform-settings.ts`, duplicated per app the same way the rest of
the storefront's shared UI is — there is no shared npm package between
`main-web` and `pdf-web`), defaulting to `true` until the fetch resolves so
the note does not flash in after first paint.

---

## 8. Logging and monitoring

The API (Cloud Run service `jsmf-backend`) writes **one JSON object per line**
in production (`LOG_FORMAT`, default `json` when `NODE_ENV=production`), each
with a Cloud Logging `severity`, so everything below is a filter in
**Cloud Console → Logging → Logs Explorer**. Locally it prints coloured text.

### What is logged

Every request: `jsonPayload.activity="http.request"` with `method`, `path`
(query string deliberately dropped — it carries OAuth codes and tokens),
`status`, `durationMs`, `userId` when signed in, `ip`, `userAgent`. 5xx is
`ERROR`, 4xx `WARNING`, the rest `INFO`. Health probes are skipped.

Business events, each with the ids needed to follow one buyer or one order:

| `activity` | When | Key fields |
| :--- | :--- | :--- |
| `auth.signup` | account created (password, email-code, Google) | `method`, `userId` |
| `auth.login` / `auth.login_failed` | sign-in (password, Google) / refused | `method`, `userId` or `email`, `reason` |
| `session.registration_started` | "Book My Spot" accepted, order created | `userId`, `sessionId`, `orderNumber`, `exam`, `stage`, `hasMobile` |
| `session.registration_refused` | booking refused | `userId`, `reason` (full / already booked / started / no email) |
| `checkout.started` | Razorpay order created | `orderNumber`, `userId`, `amountMinor`, `providerOrderId` |
| `checkout.provider_error` | Razorpay refused to create the order | `orderNumber`, `reason` — **wrong keys show up here first** |
| `webhook.received` | any verified Razorpay webhook | `eventId`, `eventType`, `providerOrderId` |
| `payment.settled` | order paid, seat granted | `orderNumber`, `userId`, `amountMinor`, `method`, `via` (webhook / checkout-callback / reconciliation), `firstSettlement` |
| `payment.failed` | Razorpay reported a failed attempt | `providerOrderId`, `errorCode`, `errorDescription` |
| `payment.verify_rejected` | browser callback refused | `reason` |
| `webhook.failed` | processing threw (Razorpay will redeliver, and it is retried) | `eventId`, `reason` |
| `webhook.foreign_payment_ignored` | Payment Page / link payment, not a JSMF order | `providerOrderId`, `amountMinor` |
| `session.confirmation_sent` / `session.confirmation_not_delivered` | seat confirmation email | `orderNumber`, `reason` |

Never logged: passwords, tokens, OTP codes, signatures, card/UPI details,
full webhook payloads (those are stored in `payment_webhook_events` instead).

### Queries worth saving

Paste into the Logs Explorer query box (resource is the backend service):

```
# Every sale today
resource.labels.service_name="jsmf-backend"
jsonPayload.activity="payment.settled"
jsonPayload.firstSettlement=true

# The whole story of one order (from a support email)
jsonPayload.orderNumber="JSMF-2026-000123"

# Everything one person did
jsonPayload.userId="<user id>"

# Anything that needs attention right now
resource.labels.service_name="jsmf-backend"
severity>=ERROR

# Bookings that were refused, and why
jsonPayload.activity="session.registration_refused"

# Failed payment attempts (card declined, UPI timeout …)
jsonPayload.activity="payment.failed"

# Checkout could not start — usually wrong Razorpay keys
jsonPayload.activity="checkout.provider_error"

# Webhooks that failed processing
jsonPayload.activity="webhook.failed"
```

### Alerts to set up (recommended, one-time)

In Logs Explorer, run a query → **Create alert** (log-based alert), notify by
email:

1. `jsonPayload.activity="checkout.provider_error"` — nobody can pay.
2. `jsonPayload.activity="webhook.failed"` — a payment is not settling.
3. `resource.labels.service_name="jsmf-backend" severity>=ERROR` — anything
   else broke.

### The other half: the database is the ledger

Logs show *what happened*; the tables are the authoritative record:
`orders` (status, `paid_at`), `payments` (Razorpay order/payment ids, method,
error codes), `payment_webhook_events` (every verified webhook, its
`status` and `processing_error`), `refunds`, `entitlements` (who holds a
seat), `session_registrations` (answers, mobile number, `confirmation_sent_at`).
The admin panel's Orders page and each session's Registrations table read
these directly.
