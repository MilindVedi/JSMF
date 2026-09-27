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

## Buyer accounts: Google only

Buyers sign in with Google and nothing else. There is one screen
(`/account/login`) rather than a sign-in and a sign-up, because
**Continue with Google** resolves to whichever the person needs — the server
looks for an account behind the Google identity and signs them in, or creates
one and signs them in. `/account/signup` redirects there, preserving `next`,
since that URL is already in the wild.

This is a decision about **email volume**, not authentication. A password
account needs a verification mail to prove the address and a reset mail when
the password is forgotten, and on a plan that allows 100 sends a day those two
flows would be most of the traffic. Google removes both: the address arrives
already verified, and account recovery is Google's problem rather than an
inbox we have to pay for.

`POST /auth/register` is therefore gated behind `PASSWORD_SIGNUP_ENABLED`
(default `false`) and answers 404. Hiding the form while leaving the route open
would still let anyone create — via the API or the Swagger page — exactly the
kind of account V1 has no forgot-password flow to recover. The service beneath
is untouched, so re-enabling it is a config change.

Admins are unaffected. They are invited by an existing admin, set a password
through the invitation flow, and sign in at `/admin/login`, which keeps its own
email-and-password form.

## Transactional email

V1 sends exactly **two** kinds of email. Everything else on the long list of
things a store *could* email about is deferred, and Google-only signup is what
makes that affordable.

| Email | Send? | On failure |
| :--- | :--- | :--- |
| **Admin invitation** | Yes | **Fails the request.** An invitation nobody receives is not a partial success, it is a broken invitation. Volume is negligible and entirely controlled — an admin decides who gets one. |
| **Purchase confirmation** | Yes | **Purchase still succeeds.** The entitlement is granted and the money kept; only the confirmation is missing. The library, not the email, is the source of truth for access. |
| Registration / email verification | No | Not needed — Google verifies the address. |
| Forgot password | No | Not needed — buyers have no password. |
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

The rule that outlives this list: **an email must never be the reason a
completed action is reported as failed.** It is implemented as the split
between `MailService.send` (throws — for mail that *is* the feature) and
`MailService.sendBestEffort` (never throws — for mail that merely accompanies
something already done and undoable).

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
