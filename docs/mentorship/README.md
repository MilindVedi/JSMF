# One-to-one mentorship calls

A private, paid call with Dr. Angad, booked for a time slot on jsmf.me.

- **Visitors:** `/mentorship` (book), `/mentorship/bookings` (see, join, reschedule).
- **Home page:** a "Want a plan made just for you?" banner. The header gets a **Book 1:1** link.
- **Admin:** store admin → **1:1 calls** (`/admin/mentorship`): bookings, availability, settings.

The banner and the header link only appear once an offering is **published**. Until then the
website looks exactly as it did before this feature.

## How it fits the existing system

| Concern | Where it lives | Reused or new |
|---|---|---|
| Price, title, publish state | `products` row, type `MENTORSHIP` | Reused (catalog) |
| Checkout, Razorpay, receipts, refunds | `OrderService` / `PaymentService` | Reused unchanged |
| "This order was paid" | `OrderEvents.paid` → `MentorshipBookingService.onOrderPaid` | Reused hook |
| "This order was refunded" | `OrderEvents.refunded` (new, additive) | New hook, same pattern |
| Reminders and lapsed holds | `SweepRegistry` on the existing 5-minute `/internal/session-reminders` tick | New registry, no new scheduler job |
| Rules, hours, bookings | `backend/src/modules/mentorship/` | New, decoupled module |

Nothing depends on the mentorship module. It hears about payments and refunds through
`OrderEvents`, and joins the clock through `SweepRegistry`. Removing it never touches payment code.

A 1:1 call never becomes a library item. Settlement skips the entitlement for `MENTORSHIP`
items, so the same person can book again; the booking row is what they hold.

## The slot rule (`domain/slots.ts`)

A pure function with no database and no clock, unit-tested on its own. Its inputs:

- **Weekly hours:** e.g. Mon–Sat 10:00–13:00 and 18:00–21:00, in the offering's timezone (IST).
- **Dated exceptions:** block a whole day or part of one, or add an extra window.
- **Fixed grid:** a slot starts at the window's start, then every `duration + buffer` minutes.
  It is offered only if the call itself fits inside the window.
- **Filters:** minimum notice, the booking window, and times already taken.

A slot occupies `[start, start + duration + buffer)`. The client sends only a start time. The
server accepts it only if the rule itself offers that exact start.

## Double booking is impossible

The migration adds an **exclusion constraint** on `mentorship_bookings`. Two `PENDING_PAYMENT`
or `CONFIRMED` bookings of one offering can never have overlapping `[starts_at, blocked_until)`,
however two requests race. The service checks first to give a clear message, then relies on the
constraint for the race a check cannot close. This is tested with simultaneous holds and with
direct inserts.

## A booking's life

1. **Hold.** `POST /mentorship/:slug/bookings` holds the slot for `MENTORSHIP_HOLD_MINUTES`
   (`PENDING_PAYMENT`) and starts the normal checkout. Picking another time replaces the
   person's earlier unpaid hold.
2. **Paid.** The booking becomes `CONFIRMED`. One confirmation email goes out (the generic
   receipt is skipped), plus an alert to `MENTORSHIP_ADMIN_NOTIFY_EMAIL`.
   - **Late payment, slot still free:** a payment that lands after the hold lapsed is still
     confirmed.
   - **Late payment, slot taken (or time already passed):** the booking becomes
     `PAID_UNSCHEDULED`. The buyer is told someone will be in touch, and the admin is alerted.
     The admin gives it a time from the booking page, or refunds it.
3. **Joining link.** The admin pastes it on the booking page, and the attendee is emailed it. The
   reminder before the call (`MENTORSHIP_REMINDER_LEAD_MINUTES`) waits until a link exists.
4. **Reschedule.**
   - **Attendee:** can move the call to another open slot until `rescheduleCutoffMinutes` before
     it starts, at most `maxReschedules` times.
   - **Admin:** can move it to any future time; the constraint still applies.
5. **Refund** (Orders → Refund, or the booking page), through Razorpay or recorded as paid back
   by hand, in full or in part. With **Revoke access** on, the booking becomes `CANCELLED` and
   the time is freed; with it off, the call stays booked. Only the refund email goes out (if
   ticked).
6. **Cancel without refund:** admin only, with an optional email.
7. **After the call:** the admin marks it Completed or No-show.

## Security

- Prices come from the product; the request carries none.
- Times are checked against the rule; the database refuses overlaps.
- Attendee routes scope every query to the caller. Someone else's booking is a 404, never a 403.
- The Meet link appears only in the attendee's own responses and emails, and only around the call.
- Holding a slot is rate-limited, and each person has one active hold per offering.
- Every admin change is written to the audit log; bookings and moves are in the activity log.
- Inputs are validated: phone via libphonenumber, links must be `https://`, length limits apply.

## Configuration (backend env)

| Variable | Default | Meaning |
|---|---|---|
| `MAIN_WEBSITE_URL` | `https://jsmf.me` | Links in booking emails |
| `MENTORSHIP_HOLD_MINUTES` | `20` | How long a slot is held while paying |
| `MENTORSHIP_REMINDER_LEAD_MINUTES` | `60` | When the pre-call reminder goes out |
| `MENTORSHIP_ADMIN_NOTIFY_EMAIL` | none | Who gets booking/move/needs-attention alerts |

## Database

Migration `20261013120000_mentorship` is additive:

- one new `ProductType` value;
- four new tables;
- CHECK constraints;
- the exclusion constraint, which needs the bundled `btree_gist` extension (available on
  Cloud SQL).

Rolling the app back needs no database rollback.
