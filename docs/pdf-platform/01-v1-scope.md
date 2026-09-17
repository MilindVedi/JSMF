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

## What "done" looks like

V1 is done when the doctor can, without any developer involvement: upload a PDF, price it, publish it, paste the link into a YouTube description — and a stranger who clicks that link can pay and download it, with the money arriving and the access being correct even if they close the tab mid-payment, pay twice by accident, or share the download link with a friend.

That last clause is the actual engineering bar, and it is why V1 includes webhook idempotency, entitlement checks, and expiring signed URLs rather than treating them as polish.
