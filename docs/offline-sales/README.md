# Buyers added by hand (offline sales)

Someone who paid outside checkout — by UPI straight to us, through Razorpay's
hosted Payment Page, by bank transfer or cash — is invisible to the platform
until an admin records them. Recording them makes them an ordinary buyer:
reminders, the session details email, the seat count, the included PDF and refunds all
treat them like anyone who paid on the website.

- **Admin:** store admin → Sessions → a session → **Buyers added by hand** →
  **Add buyers** (`/admin/sessions/:id/buyers`). Admins only — it records money.
- **Terminal:** `npm run db:backfill:session-buyers` (`backend/prisma/backfill-session-buyers.ts`),
  for a long list or when the panel is unavailable.

Both run the same code, so a file that works in one works in the other, and
everyone added either way appears in the same list.

## Adding buyers

Two ways in, one result:

1. **Fill in** — one card per buyer. Amounts in rupees; the payment time is
   typed in IST. Changing the discount recalculates the amount paid from the list
   price; the amount paid can still be set directly (someone who paid an older price).
2. **Upload a file** — a JSON list (format below). **Download a template** gives a
   starting file.

Then **Check**. The server reads every row and shows what it would do — *New
account*, *Existing account*, or *Already has a seat — skipped* — and writes
nothing. Mistakes are listed against their row; with any mistake, nothing can be
recorded. Warnings (going over capacity; a reminder about to go out) do not block.

**Add N buyers** records exactly what was checked. Editing anything after the
check asks for a new check.

No email is sent. These buyers were dealt with in person when they paid.

## The file

```json
[
  {
    "name": "Riya Sharma",
    "email": "riya.sharma@gmail.com",
    "whatsappNumber": "+919876543210",
    "amountPaidMinor": 119900,
    "discountMinor": 30000,
    "method": "UPI_DIRECT",
    "reference": "UPI reference, optional",
    "paidAt": "2026-10-10T14:30:00+05:30",
    "note": "Early-bird discount",
    "exam": "NEET-PG",
    "stage": "Final year"
  }
]
```

| Field | Required | Notes |
|---|---|---|
| `name` | yes | As it appears in emails to them |
| `email` | yes | The address they will sign in with. The account is matched by it |
| `whatsappNumber` | no | `+<country code><number>`, or a 10-digit Indian mobile |
| `amountPaidMinor` | yes | What they paid, **in paise** — ₹1,199 is `119900` |
| `discountMinor` | no | What they were let off, in paise. List price = paid + discount |
| `method` | yes | `RAZORPAY_PAYMENT_PAGE`, `UPI_DIRECT`, `BANK_TRANSFER`, `CASH` or `OTHER` |
| `reference` | no | For a Payment Page sale, the `pay_…` id — then a refund in the Razorpay dashboard takes the seat back. Otherwise anything that finds the payment later (a UTR) |
| `paidAt` | yes | Date, time **and timezone**. `2026-10-10` alone would be read as 5:30 am IST |
| `note` | no | Up to 500 characters |
| `exam`, `stage` | no | A session's own questions. Left out, they show blank in admin |

The first script's names still work: `amountMinor`, `paidVia`
(`upi-direct`, `razorpay-payment-page`) and `razorpayPaymentId`. At most 200
buyers per list.

## What one buyer becomes

In one transaction, all dated at `paidAt`:

| Row | Detail |
|---|---|
| user | Created if absent, **unverified** — claimed when they sign up with that email (Google, or setting a password). Their number goes to `contactPhone` (the profile's mobile number) unless they already set one; never to `phone`, the verified sign-in number |
| order | `PAID`; subtotal = list price, discount, total = paid. One item |
| payment | `CAPTURED`. A Payment Page sale is `RAZORPAY` with its `pay_…` id; anything else is `OFFLINE`, with no provider ids |
| entitlement | `PURCHASE`, plus the included items when the product grants them at payment |
| offline sale | How it was paid, the reference, the note, who recorded it and through which door (`FORM`, `FILE`, `SCRIPT`) |
| the product's own rows | A session registration — see below |
| audit log | `offline_sale.recorded` |

A buyer who already has an active seat is skipped, so a list can be sent again
after a fix without adding anyone twice. The same buyer with the same Razorpay
payment id counts as a repeat, not a clash.

**Refunds.** A Payment Page sale refunds like any other (in the Razorpay
dashboard, or from admin once refunds are on). For `OFFLINE` money there is
nothing to refund through an API: the admin refund refuses it, and the money
goes back by hand.

## Design

```
orders module (owns orders, payments)            events module (owns sessions)
  OfflineSaleService  ── asks ──►  OfflineSaleHandlers  ◄── registers ── SessionOfflineSaleHandler
  parseOfflineSaleRows (pure)                                             (registration, exam/stage,
  AdminOfflineSaleController                                               capacity + reminder warnings)
```

- **One reader** (`orders/domain/offline-sale-rows.ts`) for the form, the file and
  the script. Product-agnostic: fields it does not know are handed to the
  product type as `details`.
- **Opt-in per product type.** A type can be sold offline only once its module
  registers an `OfflineSaleHandler` — the same pattern as `OrderEvents`. Orders
  never imports sessions, so supporting a new type (a PDF, a plan, a one-to-one
  call with its time slot) is a new handler, not an edit here. Types without one
  are refused.
- **Admin UI** (`pdf-web/src/components/admin/offline-sales/`) is generic too: the
  page passes the product's own questions as `detailFields`, and the list shows
  whatever labelled `details` the handler returns.

Endpoints, ADMIN only:

| Method | Path | |
|---|---|---|
| `GET` | `/admin/products/:id/offline-sales` | The list, in payment order |
| `POST` | `/admin/products/:id/offline-sales/preview` | `{ buyers }` → per-row plan, errors, warnings. Writes nothing |
| `POST` | `/admin/products/:id/offline-sales` | `{ buyers, entry: "FORM" \| "FILE" }` → recorded / skipped / failed |

## Database

Migration `20261016120000_offline_sales`, additive: the `offline_sales` table, the
`OfflinePaymentMethod` and `OfflineSaleEntry` enums, and `PaymentProvider.OFFLINE`.
It also copies anyone the first script had already brought in (recognised by
`backfill` in the order's notes) into `offline_sales`, so they appear in the list.
Payments those runs made for direct UPI keep provider `RAZORPAY` with no ids; the
refund guard reads the ids, so they behave the same.
