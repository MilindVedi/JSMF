# Main website (jsmf.me)

The public home of JSMF. Today it does one job: **sell seats at paid live
sessions with Dr. Angad Rai**. Design source: `web-main-design/`. Code:
`main-web/` (Next.js, port 3002).

**Running a session day to day? Start with the [admin guide](./admin-guide.md):**
step-by-step tasks. This document is the reasoning, data model and API behind
them; the guide links into it section by section.

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
| Resources / Browse pages from the design | **Not built** | Resources live on resources.jsmf.me; "Explore resources" links there. |
| Session dates | **Optional** — a session can be published with no days at all | Lets the admin open registration before the schedule is fixed. The website shows **"Date to be announced"** / **"Time to be announced"** wherever a date would go, and registration stays open (nothing has started yet). Telling existing buyers once dates are set is a **deliberate admin action** — see §3d. |
| Admin-triggered refunds | **Disabled by default** (`REFUNDS_ENABLED=false`) | The real Razorpay integration is new; this gates only the *admin dashboard* "Refund" button/endpoint, which moves money through Razorpay's API. A refund issued directly in the **Razorpay dashboard** still revokes the buyer's access automatically — see §3a. |
| The included PDF | **Delivery timing is per-session, admin-chosen** (`IMMEDIATE` \| `AUTO_AFTER_SESSION` \| `MANUAL`) | Lets seats go on sale before the PDF is finished — see §3b. |
| Seat-count visibility | **Admin toggle**, `showSeats` | Off hides both `seatsRemaining` and the temporary `displaySeats` number from every public response, without touching the underlying numbers. |
| "Check your spam folder" note | **One platform-wide admin toggle** (`PlatformSettings.showSpamFolderNote`) | Shown wherever a verification email or Google sign-in is offered, on **both** jsmf.me and resources.jsmf.me — see §7. |

---

## 2. Data model — reuse first, add only what a session alone has

A session is a **`products` row with `type = LIVE_SESSION`**. That is the whole
trick: orders, order items, payments, Razorpay, refunds, audit and entitlements
work unchanged — the schema was designed for new product types from day one.

What only a session has lives in four tables (migrations
`20260930150000_live_sessions` and `20261001120000_live_session_days`).
Later features added their own tables and columns, each described where the
feature is: §3c (`session_bundle_deliveries`), §3d (`session_detail_receipts`,
`session_detail_emails`, `telegram_url`), §3d-bis (`session_materials`,
`session_material_notices`, `products.listed`), §3e
(`session_testimonial_sections`) and §3f (the six `feedback_*` tables). The
table below is the original four; the columns added later are not repeated.

**`live_sessions`** — one row per session product, keyed by `product_id`.

| Column | Notes |
| :--- | :--- |
| `product_id` | PK, FK → products **RESTRICT** |
| `starts_at` | the **first day's** start — a copy the service writes in the same transaction as the days, so listing, ordering and "registration closes at the start" stay one indexed column. **Nullable**: a session with no days yet (`days: []`) has `starts_at = NULL`, the website shows "Date to be announced", and registration stays open because nothing has started. `ORDER BY starts_at NULLS LAST` keeps undated sessions from sorting as if overdue. |
| `platform_label` | display text ("Live on Zoom · Link sent on mail") |
| `short_name` | The session's **stable name**, used in every email and the library label instead of the product title. The title is what the booking card shows and is often reworded day to day; this one is not. NULL falls back to the title. Always read through `sessionDisplayName()` (`events/domain/session-display.ts`), so no email can use the other name by mistake. Migration `20261018120000_session_short_name`. |
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
of site-wide toggles shared by jsmf.me **and** resources.jsmf.me. See §7.

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
- **Two pieces of the confirmation email are editable per session**, in the
  admin form's *Confirmation email* card. `confirmation_subject` replaces the
  default `JSMF - Your seat is confirmed: {title}`, with `{title}` substituted
  wherever it appears so renaming the session does not strand the subject.
  `pending_join_link_text` replaces the sentence shown in place of the Join
  button while `join_url` is empty — the built-in "We will email you the
  joining link before the session starts" is wrong for a session whose dates
  are not announced yet, because there is no start to be before. Both are
  nullable and fall back to the built-in wording, so an existing session that
  nobody edits is unchanged. Neither appears in the public API: email copy is
  not a visitor's business.
- **One toggle, `show_not_spam_notice`, appends a short info box to every
  email the platform sends for the session** — the confirmation, the dates
  announcement, each day's reminder, and the bundle-ready note — reminding
  the recipient to mark the message *Not spam* if it landed there. On per
  session rather than platform-wide: a brand-new session with no sender
  reputation benefits from the nudge, while a steady one with high
  deliverability does not need to pester everyone forever. Default is off, so
  turning it on only ever adds the box; nothing already in flight changes
  wording retroactively.
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
the order is marked partially refunded and access is removed only when
everything paid has come back. This is on top of, not instead of, the admin
refunds (through Razorpay, or recorded as paid back by UPI/bank/cash, either
in full or in part, keeping or removing access), documented in
`docs/pdf-platform/02-architecture.md` §"Status: built — admin order management
and refunds" — all of them use the same revocation.

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

Everyone who bought through the Payment Page, or paid the UPI id directly, is
invisible to the platform — no account, no order, no entitlement — so the seat
count, the day reminder, the session details email and the bundled PDF all
pass them by. An admin records them as ordinary buyers from the session's page
(**Buyers added by hand → Add buyers**), by form or JSON file, with any
discount; `npm run db:backfill:session-buyers` does the same from a terminal.
See **[docs/offline-sales](../offline-sales/README.md)** for the file format,
what each buyer becomes, and the design.

Two details that decide whether it works:

- **The registration row is not optional.** The entitlement alone covers the
  seat count, the session details email and the bundled PDF — but the day reminder
  query (`sendDueReminders`) reads `sessionRegistration` joined to an active
  entitlement, so an entitlement-only record would silently drop these buyers
  from the one email that carries the joining link. The session's offline-sale
  handler writes it, dated at the payment.
- **The email must be the one they will sign in with.** Google sign-in attaches
  to an existing account by email only when Google says the address is verified;
  a buyer who signs in with a different address gets a second, empty account and
  no seat. Confirm the addresses with each buyer rather than assuming the one
  they typed on the Razorpay page. A buyer whose address is not a Google account
  can instead use **Create account** with that same email: once the code is
  entered, the password is set on the pre-made account (seat included) rather
  than refused as a duplicate — only for an account nobody has ever signed in to
  (`AccountRecoveryService.isUnclaimed`). **Forgot your password?** on the
  sign-in page works too, for any account with no password yet: the code sets a
  first password on the same account. Point a buyer there when they say "I
  can't log in" and their address is not a Google account (a Gmail `+` address
  never is).

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

## 3c-bis. Selling a session that has already started

Registration normally closes the moment the first day begins — a seat bought
after that is a seat for something partly over. For a multi-day session that is
not true: day 3 of 4 is still worth joining, usually at a lower price.

`live_sessions.late_registration` (admin switch: **Keep selling after the
session has started**) keeps it on sale until the end of its **last** day:

- the website keeps showing it as the upcoming session, with Book working;
- `registrationOpen` stays true, so seats, the confirmation email, reminders
  for the remaining days and the session details email all behave as usual;
- no recording is offered while it is still running;
- when the last day ends it closes by itself — the switch needs no undoing.

A genuinely future session wins over a running one: if both exist, the website
shows the one that has not started. The price is not touched by any of this —
the admin lowers it by hand as days pass.

---

## 3d. Session details: dates, joining link, Telegram group

Three things an attendee needs from us, which often arrive after they pay: the
**dates** (a session can be sold before they are fixed), the **joining link**,
and the **Telegram group** for registered candidates (`live_sessions.telegram_url`,
private like the joining link). Saving any of them emails nobody —
`LiveSessionService.update()` sends no mail, by design. The admin sends them
from the **Session details sent** card on the session's page.

**What each person was last sent** is stored per detail in
`session_detail_receipts` — the value itself (the link, or a fingerprint of the
whole schedule). Comparing it with the session now gives, per person and per
detail:

| Status | Meaning |
|---|---|
| Up to date | They received exactly what the session has now |
| Not sent | They never received this detail |
| Changed since sent | They have an older value |
| Not set | The session has none — nothing to send (a removed link) |

Because the value is stored, not a version number, going back to an earlier link
makes whoever last received that exact link up to date again.

**Every email that carries a detail counts:** the confirmation (all three, as
they are at payment — so someone paying after the links are set is up to date
at once), the reminder before each day (the joining link), and the details email
itself. Buyers added by hand (offline sales) received nothing, so everything is
due for them.

**The details email** (`liveSessionDetails`, tag `session-details`) carries only
what that person still needs, in one email; the session and its time are always
shown for context. The subject names the one thing when there is one ("Updated
joining link", "Join the Telegram group", "Updated schedule"); several together
read "Your session details". With dates but no joining link yet, it says the
link will follow. The Telegram line reads "A separate Telegram group just for
registered candidates of this session — join here."

The card shows a count per detail ("5 need the updated joining link"), a
status per person, and the last details email each person got (with the failure
reason, if it failed). **Send everything outstanding**, **Send to selected** and
a per-row **Send** all follow the same rule, so pressing twice sends nothing new.
Sending is refused only when the session has no dates and no links at all.

History: every details email is kept in `session_detail_emails` with exactly
what it carried, its outcome and who sent it; every change to the links is in
the audit log (`live_session.updated`, before and after).

Design: `events/domain/session-details.ts` is pure — the list of details, how to
read each one's current value, and the status rule. A new detail (a WhatsApp
group, the recording) is an entry there plus its part of the email; items are
stored as text, so it needs no migration.

API: `GET /admin/sessions/:id/details`, `POST /admin/sessions/:id/details/send`
with an optional `userIds` body. Log line: `session.details_sent`.

Migration `20261016150000_session_details` (additive) carried over anyone
already told the current dates — by the old "Notify attendees" or a real
confirmation sent after the dates last changed. Links were not carried over:
nothing recorded which link an earlier email held, so they show as not sent.
`session_date_announcements` stays in the database, unused.

**Not covered:** a day set in the past, or one starting before the next 5-minute
sweep, still gets no automatic reminder — `startsAt: { gt: now }` excludes it.

---

## 3d-bis. Day materials: PDFs for each day of a session

Each day of a session can carry one or more PDFs — the notes from Day 1, the
slides for Day 2. They are ordinary **store PDFs**: upload one in Products as
usual, then attach it to a day from the session's **Day materials** card. Turn
off its **Show in store** switch (below) when it is only for seat holders.

**Who gets it.** Attaching a PDF gives it straight away, as an entitlement
(`EntitlementSource.SESSION_MATERIAL`, `sourceProductId` = the session,
`sourceOrderId` = the seat's order), to every seat holder due it. It shows in
their library, labelled *Session material* with the session's name, and
downloads through the ordinary path. "Due it" follows one setting on the
session, **Late joiners get earlier days' materials** (`live_sessions.
late_joiners_get_earlier_materials`, on by default):

| Setting | Paid before the session | Paid after Day 1 ended |
|---|---|---|
| On | every day | every day |
| Off | every day | only the days that had not ended when they paid |

The day in progress when someone pays counts as theirs. "Paid" is when the seat
was granted — for a buyer added by hand, the payment time entered.

**Kept in line automatically.** `SessionMaterialsService.reconcile` makes the
grants match the rule — granting what is due, taking back what is not — and
runs whenever an input changes: a PDF added or removed, the session saved (the
setting or a day's time), a seat paid for (an `OrderEvents` listener), a buyer
added by hand (the offline-sale handler, inside its transaction), and on the
5-minute sweep (`sessionMaterials` in `SweepRegistry`) as a safety net. It only
ever touches SESSION_MATERIAL grants it made: someone who bought the PDF keeps
their own copy whatever happens here.

**Taking access back.** Removing a PDF from a day takes it back from everyone
who had it through this session. A refund of the seat takes it back too, with
everything else the seat gave (same order). A day with PDFs attached cannot be
deleted by editing the session's dates — remove its PDFs first.

**Emailing.** Adding a PDF emails nobody. The card's table shows, per seat
holder, how many PDFs they have and which they have not been told about;
**Email everyone with new PDFs**, **Email selected** and the per-row **Email**
send one email per person listing only what is new to them, grouped by day,
with an *Open my library* button (`liveSessionMaterials`, tag
`session-materials`). Tracked in `session_material_notices`; a failure keeps
its reason and is retried by the next send. Pressing twice sends nothing more.

**Show in store** (`products.listed`, default on). Off keeps a product out of
the store — browse, search, the featured strip and its `/p` page — and stops
anyone buying or freely claiming it. People who already hold it keep it in
their library, where it shows without a link. Set it in the product editor's
Details step; the product list marks such products *Hidden from store*.

API: `GET /admin/sessions/:id/materials`, `POST /admin/sessions/:id/materials`
(`{ dayId, productId }`), `DELETE /admin/sessions/:id/materials/:materialId`,
`POST /admin/sessions/:id/materials/send` (optional `userIds`). Log lines:
`session.material_added`, `session.material_removed`, `session.materials_sent`.

Migration `20261017150000_session_materials`, additive: `products.listed`,
`live_sessions.late_joiners_get_earlier_materials`, the `SESSION_MATERIAL`
entitlement source, and the `session_materials` and `session_material_notices`
tables.

**Not built:** recordings. Deferred on cost (serving video from our own storage
is roughly ₹900 per 1 GB recording watched by 92 people). The day structure here
is where they would attach.

---

## 3e. Testimonials

Screenshots of what past attendees said, shown on the home page (between the
upcoming-session section and About Dr. Angad) and on `/prep-kit` (after "The
strategy behind the preparation"). Rendered through one shared component
(`main-web/src/components/testimonials-section.tsx`) used by both pages —
one implementation, one place to style, one visual contract. The section
renders nothing at all when the upcoming session has no testimonials, so
the import is safe to leave in regardless.

**With no session upcoming (added 2026-10-19).** The band used to disappear.
Now `GET /sessions` also returns `noSessionTestimonials: { heading, subheading,
urls } | null` (null while a session is upcoming, when the setting is off, or
when there is nothing to show), and both pages render it through
`NoSessionTestimonialsSection`. Configured on the admin **Sessions** page
(`GET/PUT /admin/sessions/no-session-testimonials`,
`NoSessionTestimonialsService`) and stored on the `platform_settings` row
(migration `20261019120000_no_session_testimonials`, additive):
`no_session_testimonials_enabled` (default true), `…_session_id` (FK→live
sessions, SET NULL; null = automatic, the most recent published session that
has begun and has screenshots in its original gallery, never the payment test
session), `…_heading` (null = "What students said after the last session.", the
first of two preset headings the admin picks from and may then edit) and
`…_subheading` (null = "From a previous revision session. A few moments
students shared afterward."). A horizontally-scrolling row of
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

### Feedback sections ("What students said after Day 1")

Beside that original gallery, a session can have any number of **named
sections** — feedback from Day 1 of the session running now, later Day 2,
toppers' messages, whatever comes next. They are shown inside the dark
**booking band** of both pages, under the session details and the Book
button, where they do the most work (`main-web/src/components/session-feedback.tsx`).

- **Data.** `session_testimonial_sections` holds each section's heading,
  optional subheading and tag, an optional `day_id` (a day of the session —
  the page then labels it "Day N feedback"), `is_visible` and `sort_order`.
  Screenshots are ordinary `session_testimonials` rows with `section_id` set;
  `section_id` NULL is the original gallery, whose copy stays on
  `live_sessions`. A new kind of section needs no schema change.
- **Shown** only when it is switched on *and* has at least one screenshot.
  Public field: `testimonialSections: [{ id, heading, subheading, tag,
  dayNumber, urls }]` on the session; `testimonialUrls` still carries only the
  original gallery, exactly as before.
- **Admin:** the session page's **Feedback sections** card. *Add section*
  creates one, hidden, pre-filled for the most recent day that has happened.
  Each has its own heading/subheading/tag/day, a *Show on website* switch, its
  own screenshots (upload, reorder, remove) and up/down to order sections.
  Deleting a section deletes its screenshots and their stored files; hiding it
  keeps them.
- **One gallery component.** The row of cards and the lightbox are
  `testimonial-gallery.tsx`, used by both the original section (light band)
  and the feedback sections (`tone="dark"`), so they behave identically.
- **Removing a day** from the dates leaves its section in place, tied to no
  day (`ON DELETE SET NULL`).

API: `POST /admin/sessions/:id/testimonial-sections`, `PATCH
…/testimonial-sections/:sectionId`, `DELETE …/testimonial-sections/:sectionId`,
`PATCH …/testimonial-sections/reorder` (`{ sectionIds }`). Screenshots use the
existing `POST /admin/sessions/:id/testimonials` with an optional `sectionId`
form field, and `PATCH …/testimonials/reorder` with an optional `sectionId`.

Migration `20261017190000_testimonial_sections`, additive: one table and a
nullable `section_id` on `session_testimonials`.

## 3f. Feedback forms (in place of Google Forms)

Step by step: [admin guide, "After each day: collect feedback"](./admin-guide.md#after-each-day-collect-feedback).

Seat holders fill in a feedback form on `jsmf.me/feedback/<form>` after
each day. Its own backend module, `backend/src/modules/feedback/`, which
nothing else imports: it joins the 5-minute clock through `SweepRegistry` and
puts picked replies on the session page through the events module's
`SessionShowcase` registry. Removing the module leaves sessions as they were.

**Decisions (2026-10-18):**
- **One form per class**, usually ("Day 1 feedback"); `day_id` null = the
  whole session, sent after its last day. A new form starts from five standard
  questions, or as a copy of another form (Day 2 from Day 1).
- **Question kinds:** star rating (1–5), scale (0–10), short answer,
  paragraph, one choice, several choices; each optional or required.
- **Who is asked:** people with an ACTIVE seat that they had by the time the
  day ended. A Day 1 form does not go to someone who joined on Day 2, and a
  refund takes away the right to reply.
- **How they reach it:** a **personal link** emailed to each one. It is signed
  (`?k=<inviteId>.<HMAC>`) and opens the form without signing in. A **shared
  link** for the Telegram group asks them to sign in with Google, and the
  server then checks the seat. One reply per person; opening either link
  again lets them change their reply until the form closes.
- **When the email goes:** `AUTO_AFTER_DAY` (default) sends it on the sweep
  once the day has ended plus `email_delay_minutes`, while the form is OPEN.
  `MANUAL` sends only from the admin page. Nobody who has replied is ever
  emailed again. A failed address is retried by the sweep up to 3 times, and
  after that only by an admin.
- **No-sign-in Telegram link (added 2026-10-18), per form** (`open_link`,
  column default off, but a new form is created with it **on** by `FeedbackFormsService.create`, so no migration; a copy keeps its source's value). On, the shared link takes replies from anyone who types their
  name: `source = OPEN_LINK`, `user_id` null, `respondent_name` set. Seat
  holders on the emailed link, or signed in, still reply as themselves. The
  browser keeps a random key (`localStorage`, `jsmf-feedback-key:<form>`) and
  only its SHA-256 is stored (`edit_key_hash`, unique per form), so the same
  browser edits its reply. Replies go to `POST /feedback/forms/:id/open-response`,
  limited per network address to `FEEDBACK_OPEN_LINK_PER_HOUR` (default 300).
  **Why both browser keys and an IP rate limit exist:**
  - *Browser `editKey`:* Identifies individual human respondents so that multiple students sharing the same hostel/campus Wi-Fi get separate, independent replies in the database (they never overwrite each other).
  - *IP Rate Limit (`FEEDBACK_OPEN_LINK_PER_HOUR`):* Because browser keys are generated client-side, an automated script could forge thousands of random keys in seconds. The network IP rate limiter is the necessary server-side flood gate that stops DDoS/spam scripts.
  - *Sizing & Scaling Rule:* Sized above the largest cohort that could share a single public IP (e.g. campus Wi-Fi or cellular NAT) times expected edits: `(Cohort size) * 3`. The default of 300 comfortably covers batches of up to ~100 students on one network. For larger sessions (e.g., 300–500+ attendees on a shared campus network), raise `FEEDBACK_OPEN_LINK_PER_HOUR` on Cloud Run (e.g. to `1000` or `1500`) without code changes or rebuilds. A blocked student silently gives up, while spam is easily deleted in admin or blocked by flipping the sign-in switch. `RATE_LIMIT_IP_CEILING_PER_MINUTE` (default 3000) acts as an absolute backstop.
  The key is sent as the `x-feedback-edit-key` header on the view, never in the
  URL. "Hide my name" does not apply there; the two website questions do. Admin
  shows them as **Telegram link · not verified**, counts them separately on
  *Who's been asked*, and the CSV has a *Verified* column. What it gives up, by
  decision: no seat check, and no stop on one person replying from two phones.
- **Anonymity is the admin's choice per form** (`allow_anonymous`). When it is
  on, students get a "Hide my name from the JSMF team" tick box. The reply is
  still tied to the account (for one reply per person and editing), but no
  admin screen or CSV shows who wrote it. The "who's been asked" table still
  shows *that* they replied, so with very few replies it can be guessed.
- **Sending by hand:** *Email attendees now* (top of each open form) emails
  everyone not yet emailed, at any time. It is for a class that ends early,
  and works in either email mode. The automatic email later skips them.
- **Templates:** five ready-made forms in code
  (`feedback/domain/default-questions.ts`): standard, quick pulse, detailed,
  end of session, and recommend only. A new form can also import the
  questions of any earlier form, from any session (`GET
  /admin/feedback/templates`, `GET /admin/feedback/forms`).
- **Website (changed 2026-10-18):** the team decides which replies to show.
  Two per-form switches:
  - `ask_show_name` (default **off**): when on, the student is asked whether
    they would like their first name shown. Their answer is guidance only.
    The admin decides per card ("With their first name" when picking a reply,
    pre-ticked from the student's answer, or ticked when they were not
    asked). An anonymous reply is always "A JSMF student".
  - `ask_consent_to_publish` (default **off**) adds "Can we show this on our
    website?". Then only replies that said yes can be picked, and withdrawing
    consent takes the card down.

  Showing replies without asking relies on the privacy policy saying that
  feedback may be shown on the website.

**Tables** (migration `20261018100000_feedback_forms`, additive only):
`feedback_forms`, `feedback_questions` (an answered question is archived,
never deleted, and its kind is fixed), `feedback_invites` (the per-person
tracking: emailed, reminders, last error, first opened; plus a short-lived
`claimed_at` so two overlapping sends never email the same person twice),
`feedback_responses` (unique per form and person; and per form and edit key for
open-link replies, migration `20261018160000_feedback_open_link`), `feedback_answers` (typed
columns `rating_value` / `text_value` / `choice_values`, with CHECK
constraints, so averages are plain SQL), and `feedback_highlights` (a picked
reply: an editable copy of the quote and name, Cascade from both the reply and
the section).

**Admin:** the session page's **Feedback forms** card, with these tabs:
- **Questions:** edit them like a Google Form and save together.
- **Settings:** the day, the note, the thank-you, the email mode and delay, a
  closing time, the anonymity and consent switches.
- **Who's been asked:** emailed, opened and replied; email everyone not yet
  emailed, or remind everyone who has not replied; per-row Email, Remind or
  Retry.
- **Replies:** numbers per question; every reply; *Show on website*; CSV
  download; delete (admins only).

Also on the card: *Copy Telegram link*, *Preview*, and *Open*, *Close* or
*Reopen*.

A day that has a feedback form cannot be removed from the session's dates
until the form is moved or deleted.

**Config:** `FEEDBACK_LINK_SECRET` is optional. When it is unset, the signing
key is derived from `STORAGE_SIGNING_SECRET` under its own label. Rotating
either one makes links already emailed stop working.

---

## 3g. Admin session page and home page calls to action

**Admin session page** (`pdf-web/src/app/(admin)/admin/sessions/[id]/page.tsx`).
Only the session itself is fetched up front. Every table below the form is a
`CollapsibleSection` (`components/admin/collapsible-section.tsx`): closed, its
content is not mounted, so it makes **no request**; opening it mounts its card,
which loads its own data. Closing unmounts, so reopening shows fresh data. Open
or closed is kept per browser in `localStorage` (`admin.section.*`), read
through `useSyncExternalStore` so the first paint always matches the server.
Each card puts the collapse chevron in its own header (`CollapseToggle`) and
shows `SectionLoading` while its first request is in flight. A new card for a
session: wrap it in a `CollapsibleSection` with a unique `storageKey`.

**Home page** (`main-web/src/components/landing.tsx`):

| State | Top of the page | "Next session coming soon" band |
| :--- | :--- | :--- |
| A session is on sale | **Book Your Spot Now**, then **Book a 1:1 session** | not shown |
| No session | **Book a 1:1 session** only | **Get notified on Telegram** (same animated style) |

The 1:1 button (`mentorship/mentorship-hero-cta.tsx`) appears only once a 1:1
offering is published, and shares the request the bottom banner makes. Both
buttons use the `.cta-spot` style in `globals.css`.

**Header** (`site.tsx`): Home, Live Session, About, Reserve a Seat, Book 1:1
(when published) and **JSMF Resources**, which opens `links.store` in a new
tab. Desktop labels are text only with `nowrap`; below `xl` (1280px) the ☰ menu
is used, because seven links do not fit on one line any narrower.

---

## 4. API

| Route | Auth | Purpose |
| :--- | :--- | :--- |
| `GET /sessions` | public | `{ upcoming, previous }` for the home page |
| `GET /sessions/registration-options` | public | exam / stage choices |
| `GET /sessions/:slug` | public | one session |
| `GET /sessions/:id/registration` | user | has a seat? saved answers |
| `POST /sessions/:id/register` | user | save answers, start Razorpay |
| `/admin/sessions` (CRUD, publish, unpublish, archive, `/:id/registrations`) | ADMIN, EDUCATOR | managed at **resources.jsmf.me/admin/sessions** |
| `GET /admin/sessions/:id/bundle-deliveries`, `POST …/bundle-deliveries/send` | ADMIN, EDUCATOR | §3c |
| `GET /admin/sessions/:id/details`, `POST …/details/send` | ADMIN, EDUCATOR | §3d |
| `GET /admin/sessions/:id/materials`, `POST …/materials`, `DELETE …/materials/:materialId`, `POST …/materials/send` | ADMIN, EDUCATOR | §3d-bis |
| `POST /admin/sessions/:id/testimonials`, `PATCH …/testimonials/reorder`, `DELETE …/testimonials/:testimonialId` | ADMIN, EDUCATOR | §3e |
| `POST /admin/sessions/:id/testimonial-sections`, `PATCH …/:sectionId`, `DELETE …/:sectionId`, `PATCH …/reorder` | ADMIN, EDUCATOR | §3e, feedback sections |
| `GET /feedback/forms/:formId?k=`, `POST /feedback/forms/:formId/response` | public (personal link or signed in) | §3f |
| `/admin/sessions/:id/feedback-forms` (list, create, `/:formId` get/patch/delete, `/questions` PUT, `/people`, `/send`, `/results`, `/responses/:responseId` DELETE, `/highlights`) | ADMIN, EDUCATOR (deleting a reply: ADMIN) | §3f |
| `POST /internal/session-reminders` | Cloud Run IAM | reminder sweep (reminders **and** the `AUTO_AFTER_SESSION` bundle sweep, §3c) |
| `GET /settings` | public | `{ showSpamFolderNote }` — read by both jsmf.me and resources.jsmf.me, §7 |
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
   `NEXT_PUBLIC_STORE_URL=https://resources.jsmf.me`; `jsmf.me` mapped to it; its
   service account granted `roles/run.invoker` on the backend.
2. Backend env: `https://jsmf.me` in `CORS_ORIGINS` and
   `https://jsmf.me/auth/callback` in `OAUTH_ALLOWED_REDIRECTS`.
   `GOOGLE_CALLBACK_URL` stays on resources.jsmf.me — the OAuth state is a signed
   token, not a cookie, so starting on one domain and finishing via the other
   works.
3. A Cloud Scheduler job: `POST /api/internal/session-reminders` every 5
   minutes, same service account as the reconciliation job.
4. Optionally set `SESSION_REMINDER_LEAD_MINUTES` (default 60).
5. Optionally set `FEEDBACK_LINK_SECRET` (§3f); without it the key is derived.

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
  hardening tests in §3a.
- More integration tests: day materials (`session-materials.integration.spec.ts`),
  testimonial sections (`session-testimonial-sections.integration.spec.ts`) and
  feedback forms (`feedback.integration.spec.ts`, plus pure rules in
  `feedback-rules.spec.ts`): one email per person, never to late joiners or
  repliers, personal link without sign-in, one editable reply per person, kept
  answered questions, consent and name rules on the website, a failed email
  retried, template and cross-session import. Full backend suite at the last
  run: **295 passing** (run with the local Docker Postgres).
- Driven in a real browser: home page desktop and mobile (no horizontal
  overflow), signed-out dialog, validation, signed-in form, and the real
  Razorpay test-mode window opening with ₹99. Admin create/edit/publish, the
  registrations table, the bundle-delivery table, and testimonial
  upload/reorder/remove.
- Driven in a browser against the local stack: the student feedback form (phone
  and desktop, signed out, replied), and a picked reply on the home page. Not
  clicked: the admin *Feedback forms* card, and *Day materials*, which are behind
  login.
- Not driven: the *Session details sent* card (§3d) — backend covered by the
  integration test above, but the admin UI itself has only been typechecked
  and linted, not clicked; completing a Razorpay payment in the browser
  (settlement is covered by the tests), a real Google sign-in round trip on
  port 3002, and a real webhook delivery against live keys (§3a/§5 — the curl check only proves
  the event *reaches* the app, not that live keys and a real signature work
  end to end).

---

## 7. Platform settings (cross-app, not session-scoped)

A few toggles apply to **both** jsmf.me and resources.jsmf.me at once and have
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
`ERROR`, 4xx `WARNING`, the rest `INFO`. Health probes are skipped, and so are
*successful* website-analytics batches (`POST /api/analytics/events`) — they
arrive every few seconds per open tab; failures are still logged. Browser-side
analytics (page views, the booking funnel) are a separate system with their
own admin page: see [Analytics](../analytics/README.md).

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
