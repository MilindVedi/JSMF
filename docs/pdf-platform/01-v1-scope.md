# PDF Platform — V1 Scope

## The one sentence version

A doctor uploads a PDF to an admin panel, publishes it, and puts its JSMF link in a YouTube description; a viewer opens that link, and either downloads it free or pays for it and downloads it from their JSMF library.

Everything in V1 exists to make that single loop work properly — including the unglamorous parts of it (payment verification, entitlement checks, private storage) that are the difference between a real product and a link to a Google Drive file.

## The flow V1 implements

```
YouTube / Instagram / website
            ↓
   JSMF public PDF page          /p/{slug}
            ↓
   Free?  ──────────────→  Download (signed URL)
            ↓
   Paid?  ──→ Login/Signup ──→ Razorpay checkout
                                     ↓
                            Payment verified (webhook)
                                     ↓
                              Entitlement granted
                                     ↓
                            My Library → Download (signed URL)
```

## In scope for V1

### Admin panel (the doctor's side)

- Log in to an admin area, separate from the student-facing site.
- Upload a PDF, with a title, short description, and long description.
- Upload a cover image.
- Mark the PDF as **free** or set a **price**.
- Tag it with categories — subject, topic, exam, and *any category type added later* (see [Data Model](./03-data-model.md), taxonomy tables — adding "Difficulty" or "Year" later needs no schema change and no deploy).
- Attach related links — the YouTube video it belongs to, and any other link type.
- Publish / unpublish.
- Edit any of the above after publishing.
- Archive (soft delete) — never a hard delete of anything a student has paid for.
- Replace the PDF file with a corrected version, without breaking existing buyers' access.
- View orders: who, which PDF, how much, payment status, date, refund status.

### Public storefront (the student's side)

- A public page per PDF at a clean, shareable URL — cover, title, description, price, and the download or buy button. This is the link that goes in a YouTube description.
- A listing/browse page filtered by the taxonomy categories above.
- Free PDFs: download without an account (still served through a signed URL, never a raw storage link).
- Paid PDFs: sign in, pay, download.

### Accounts

- Email/password signup and login, plus password reset.
- **My Library** — every PDF the user is entitled to, free claims included.
- Download any entitled PDF.

### Payments

- Razorpay integration: order created server-side, never trusting an amount sent from the browser.
- Signature verification on the client callback.
- Razorpay **webhook** as the authoritative source of payment truth, with idempotent handling so a duplicate webhook cannot double-grant or double-refund.
- Order marked paid → entitlement granted → download unlocked.
- Refunds recorded, and a refund revokes the entitlement.

### Storage and access control

- PDFs live in a **private** Google Cloud Storage bucket. There is no public URL to a paid PDF, ever.
- Every download is: check entitlement → mint a short-lived signed URL → redirect. The signed URL expires in minutes.
- Cover images live in a separate **public** bucket (they are marketing assets, and making them public means they can be CDN-cached cheaply).
- Every download is logged — who, what, when, from where.

## Explicitly out of scope for V1

These are designed for in the data model so they do not require a rewrite, but they are **not built** in V1:

- Video content, courses, and bundles. The schema is type-discriminated so these are new rows, not new tables — but V1 only implements `PDF`.
- Subscriptions (recurring access). The entitlement model already supports an expiry date for exactly this, but V1 grants only perpetual, one-time-purchase entitlements.
- Coupons and discount codes. Tables are designed in the data model, deliberately unbuilt.
- Multiple educators publishing their own content with their own public profiles and payouts. V1 has one publisher; the schema already carries an author on every product so this is additive.
- A mobile app. The API is designed to be consumed by a Flutter client later, which is the main reason business logic lives in a backend service rather than inside Next.js server actions.
- Analytics dashboards beyond the basic order list. The events are being *recorded* from day one so that the dashboards have history to show when they are built; that is the expensive part to retrofit, not the charts.
- Any integration with the PYQ question-bank app. Same account, eventually the same library — but V1 ships independently.

## Buyer accounts: Google-first, email-and-password always available

**Google is the lead action** on both `/account/login` and `/account/signup` —
the larger button, positioned first, above a divider — because it needs no
password to create or remember and most buyers already have one. Email stays
fully available directly below it, never hidden behind an extra click: not
everyone has or wants to use a Google account, and de-prioritising it in the
layout is not the same as making it hard to find.

`/account/signup` and `/account/login` are the same screen with different
copy, one extra field and a different submit. **Continue with Google** signs
in an existing account and creates one that does not exist, whichever screen
it is clicked from.

`POST /auth/register` is gated behind `PASSWORD_SIGNUP_ENABLED` (default
`true`) and answers 404 when off. It is gated rather than deleted because
hiding the form while leaving the route open would still let anyone create an
account through the API or the Swagger page.

**Signup is two steps and the address is verified.** `POST /auth/signup/start`
sends a six-digit code and **creates nothing**; `POST /auth/signup/verify`
exchanges the code for the account and a session. The name and the password
hash ride along in the verification code's `metadata` rather than in a
half-built user row, so an address that never verifies leaves nothing behind —
no unverified accounts accumulating, and no "email already taken" from a row
nobody proved they owned.

**Forgot password works the same way.** `POST /auth/password/forgot` sends a
code, `POST /auth/password/reset` sets the new password — and revokes every
live session, because a reset is often a response to someone else holding the
account and leaving their refresh tokens alive would make it cosmetic.

### When the code cannot be sent

This is the case the flow is actually designed around, because on a plan of 100
sends a day it will happen. Delivery lives behind a **channel port**
(`VerificationChannel`), and a failure is answered with what else the person
can do rather than a dead end:

```
503 { message, reason: 'quota' | 'error', attempted: 'email', alternatives: [], otherRoutes: [] }
```

`alternatives` is derived from the channels actually registered and configured
— never hardcoded. Adding an SMS channel is one class plus one line in
`VerificationDeliveryService`, and from that moment every screen that sends a
code starts offering "continue with your mobile number" without any of them
changing. There is a test asserting exactly that, because it is the kind of
claim that quietly stops being true.

`reason` separates the two failures because they deserve different advice: a
spent quota will not resolve by retrying in a minute, so the UI does not offer
a retry for it. The honest fallback offered today is Google, which needs no
code at all — `otherRoutes` can also carry `phone`, and the code already
handles that case end to end (email OTP, WhatsApp OTP, SMS fallback), but the
mobile flow is deliberately kept switched off (`PHONE_SIGNIN_ENABLED=false`)
until MSG91's DLT template and Meta's WhatsApp Business verification are both
done — see [identity/04](../identity/04-whatsapp-and-mobile-sign-in.md). Until
then, no client ever sees a mobile option: `GET /auth/methods` reports it
disabled and every `/auth/phone/*` route answers 404.

**Delivery never silently switches channel.** The buyer gave an email address
and asked for email; a code arriving on a phone they did not nominate would be
a surprise, and the number is usually not even known at that point.

Admins are unaffected. They are invited by an existing admin, set a password
through the invitation flow, and sign in at `/admin/login`, which keeps its own
email-and-password form.

## Transactional email

V1 sends **four** kinds of email. Everything else on the long list of things a
store *could* email about is still deferred.

The two rules that decide the "on failure" column: mail that **is** the feature
fails the request (an invitation nobody receives is a broken invitation; a code
nobody receives is a signup that cannot continue), and mail that merely
**accompanies** something already done never does (the money is taken, the
entitlement granted). Implemented as `MailService.send` versus
`sendBestEffort`.

| Email | Send? | On failure |
| :--- | :--- | :--- |
| **Admin invitation** | Yes | **Fails the request.** An invitation nobody receives is not a partial success, it is a broken invitation. Volume is negligible and entirely controlled — an admin decides who gets one. |
| **Purchase confirmation** | Yes | **Purchase still succeeds.** The entitlement is granted and the money kept; only the confirmation is missing. The library, not the message, is the source of truth for access. |
| **Signup verification code** | Yes | **Signup is blocked, with a way out.** No account exists yet, so there is nothing to half-create. The response carries `alternatives` and `otherRoutes`, and the screen offers Google — and, where mobile sign-in is on, a mobile number — rather than a dead end. |
| **Password reset code** | Yes | **Reset is blocked, with a way out.** Same shape. This is the worst case in the system — the person cannot sign in *and* cannot be reached — which is exactly why the fallback is explicit rather than a generic error. |
| Password changed, payment failed, refund issued | No | Deferred. Each is best-effort when built. |

The purchase confirmation is sent from `settle()` **after the transaction
commits**, and only by the call that actually moves the order into `PAID`.
Settlement is idempotent and reached from three directions — the browser
callback, the provider's webhook (which Razorpay retries) and the reconciliation
sweep — so sending on every settlement attempt would mean a buyer receiving the
same confirmation two or three times. It states the order number *and* the
payment id, so a support conversation starts with the evidence already in it,
and it is a confirmation rather than a GST invoice: tax is carried as zero
today, and calling it a receipt would make it a document with legal
requirements it does not meet.

**A buyer with no email gets the same confirmation on WhatsApp**, to the
verified number on their account — one message, never both channels. Mobile
accounts have no email at all, so without this the only buyers who could not be
told their purchase went through would be the ones who had no other way to
check. See [identity/04 §4](../identity/04-whatsapp-and-mobile-sign-in.md#4-purchase-receipts).

The rule that outlives this list: **an email must never be the reason a
completed action is reported as failed.** It is implemented as the split
between `MailService.send` (throws — for mail that *is* the feature) and
`MailService.sendBestEffort` (never throws — for mail that merely accompanies
something already done and undoable). `WhatsAppService.send` follows the second
shape for the same reason, and the integration tests assert it for both
channels.

A user-facing failure says "we could not send that right now" and never the
provider's wording. "Resend daily limit exceeded" describes our billing
arrangement, not the user's problem, and it tells a stranger which vendor we
use and how close it is to its ceiling. The real diagnosis goes to the log and
the `email_deliveries` row.

### Watching the quota

No provider reports remaining allowance. Resend's API returns only a
per-second request rate limit (`ratelimit-remaining`), never the daily or
monthly cap, so the counts are kept in `email_deliveries` and logged after each
send:

```
Email sent (admin-invitation) — 12/100 today, 340/3000 this month
```

The line becomes a warning past 80% of either allowance, and a distinct
`MAIL QUOTA EXCEEDED` error once the allowance is gone — which is the signal to
move off the free tier. `MAIL_DAILY_QUOTA` and `MAIL_MONTHLY_QUOTA` are what
those counts are measured against; raise both on upgrade.

A per-second rate limit and an exhausted daily quota both arrive as HTTP 429
and are deliberately recorded differently. Conflating them would make the
table useless for the one question it exists to answer: the first clears in a
second and says nothing about the plan, the second means upgrade.

## What "done" looks like

V1 is done when the doctor can, without any developer involvement: upload a PDF, price it, publish it, paste the link into a YouTube description — and a stranger who clicks that link can pay and download it, with the money arriving and the access being correct even if they close the tab mid-payment, pay twice by accident, or share the download link with a friend.

That last clause is the actual engineering bar, and it is why V1 includes webhook idempotency, entitlement checks, and expiring signed URLs rather than treating them as polish.
