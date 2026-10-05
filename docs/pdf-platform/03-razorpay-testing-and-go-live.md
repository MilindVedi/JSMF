# Razorpay — Testing & Go-Live Flow

Complete checklist for testing the payment integration locally, deploying to production, and backfilling the 5-6 existing Payment Page buyers.

---

## Part 1 — Test on your laptop first (Test mode, fake money)

### Step 1: Get your Razorpay Test keys

- Razorpay Dashboard → top-left toggle → switch to **Test Mode**
- Settings → API Keys → copy the **Test Key ID** and **Test Key Secret**

### Step 2: Set up a tunnel (so Razorpay can reach your laptop)

In production the backend is IAM-locked and unreachable directly — Razorpay's
webhook actually hits `pdf-web` (port 3001), whose middleware proxies every
`/api/*` call to the backend, attaching the Google ID token Cloud Run's IAM
requires (see `docs/gcp/02-deployment-guide.md` Step 7.3). Locally, tunnel to
the **same frontend**, not the backend directly, so the path you test matches
the path that runs in production:

- Install [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) if you don't have it
- Run:
  ```bash
  cloudflared tunnel --url http://localhost:3001
  ```
  (3001 is `pdf-web`; use 3002 instead if your deployment points its webhook at `main-web`)
- Copy the `https://xxxx.trycloudflare.com` URL it gives you
- Note: this free quick-tunnel URL changes every time you restart `cloudflared`, so you'll need to update the webhook URL in Razorpay (Step 3) each time you restart the tunnel

### Step 3: Create a Test webhook in Razorpay

- Razorpay Dashboard (still in **Test Mode**) → Settings → Webhooks → Add New Webhook
- **URL:** `https://xxxx.trycloudflare.com/api/webhooks/razorpay`
- **Secret:** make one up, e.g. `test-secret-123`
- **Events to tick:** `payment.captured`, `payment.failed`, `refund.processed`

### Step 4: Set your local `.env` to Test mode

```env
RAZORPAY_KEY_ID=rzp_test_xxxx
RAZORPAY_KEY_SECRET=your_test_secret
RAZORPAY_WEBHOOK_SECRET=test-secret-123   # must match what you typed in Step 3
```

### Step 5: Start everything locally

```bash
npm run db:up        # Docker (Postgres + Redis)
npm run start:dev    # NestJS backend
# also start the frontend (pdf-web / web) separately
```

### Step 6: Do a test purchase

- Open your local frontend in a browser
- Pick any session → click Buy
- Razorpay checkout opens → use their **test card:**
  - Card number: `4111 1111 1111 1111`
  - Expiry: any future date
  - CVV: any 3 digits
- Complete the payment

**Verify after the purchase:**

- [ ] Webhook arrives (visible in your backend terminal logs)
- [ ] User gets an entitlement in the DB
- [ ] Confirmation email lands (check Mailtrap or your test mail driver)
- [ ] Seat count goes up in the admin panel

### Step 7: Test bad network / dropped connection

- Start a payment → while the Razorpay popup is open, **turn off Wi-Fi for 5 seconds** → turn back on
- The webhook will still arrive (Razorpay retries for 24 hours) → your backend should still grant the seat
- Also test: **close the browser tab right after paying** → same result, webhook handles it

### Step 8: Test a dashboard refund

This tests the `refund.processed` webhook — the path you'll actually use for refunds in production (the in-app admin button stays off via `REFUNDS_ENABLED=false`, but the dashboard refund path works regardless of that flag).

- Razorpay Dashboard (Test mode) → Payments → find your test payment → Refund
- After the `refund.processed` webhook arrives, verify in the DB:
  - entitlement is **revoked**
  - order and payment are marked **REFUNDED**
  - a row exists in the `refund` table
  - the seat count goes back up
  - the buyer receives the **refund confirmation email** (full refunds only — a partial refund leaves access in place and sends nothing)

### Step 8b: Test the reconciliation sweep (optional)

This is the safety net that catches a payment Razorpay captured but whose webhook never arrived (dropped webhook, Razorpay outage, etc.). It runs automatically every 5 minutes, but only looks at payments that are **older than 10 minutes** and **younger than 72 hours** — so to test it without waiting:

1. Make a test payment, but prevent the webhook from reaching your backend (e.g. don't start `cloudflared`, or temporarily break the webhook URL in the Razorpay dashboard). The payment stays captured on Razorpay's side but stuck `CREATED` in your local DB.
2. Either wait 10 minutes, or temporarily lower `PAYMENT_RECONCILIATION_STALE_AFTER_MINUTES=1` in `backend/.env` and restart the stack (`docker compose down && up` — env changes need a full recreate, a plain restart won't pick it up).
3. Trigger the sweep immediately instead of waiting for the next 5-minute tick. This is a direct call from your own machine, not a Razorpay-originated request, so there's no reason to route it through a frontend proxy — hit the backend on its Docker-published port directly:
   ```bash
   curl -X POST http://localhost:4000/api/internal/reconcile-payments
   ```
4. Check the response — `{ "ran": true }` — and the backend logs for `Reconciliation found an unsettled capture on ... — settling it now`.
5. Verify in the DB/admin panel: the order and payment flip to PAID, and the entitlement is granted — exactly as if the webhook had arrived.

### Step 9: Test the IP allowlist (optional)

- Set `RAZORPAY_WEBHOOK_IPS=` to something wrong in `.env` → send a test webhook from the Razorpay Dashboard → backend should return **403**
- Set it back to the correct Razorpay IPs → works again

---

## Part 2 — Deploy to production

### Step 1: Push your code

```bash
git add .
git commit -m "feat: razorpay integration hardening + backfill script"
git push origin razor-pay-real
# then merge to main and deploy to Cloud Run as usual
```

### Step 2: Set production env vars in Cloud Run

```env
RAZORPAY_KEY_ID=rzp_live_xxxx          # your LIVE key (not test)
RAZORPAY_KEY_SECRET=your_live_secret
RAZORPAY_WEBHOOK_SECRET=your_live_webhook_secret
RAZORPAY_WEBHOOK_IPS=                   # leave empty for now; add IPs later if you want
```

### Step 3: Create the Live webhook in Razorpay

- Razorpay Dashboard → switch to **Live Mode**
- Settings → Webhooks → Add New Webhook
- **URL:** `https://yourdomain.com/api/webhooks/razorpay` (your frontend's domain — see Step 2's note on why the webhook goes through the frontend, not the backend, in this deployment)
- **Secret:** same value as `RAZORPAY_WEBHOOK_SECRET` above
- **Events:** `payment.captured`, `payment.failed`, and **`refund.processed`**

> **`refund.processed` is important.** The backend already handles this event: when you refund a payment directly in the Razorpay Dashboard, the webhook fires and the backend automatically records the refund, marks the order REFUNDED, and revokes the buyer's access — which frees the seat. This path does **not** depend on `REFUNDS_ENABLED`; that flag only controls the in-app admin refund button. Tick `refund.processed` so dashboard refunds clean up properly on their own. See [Part 4](#part-4--doing-refunds-before-the-admin-refund-button-is-enabled).

### Step 4 (quick, repeatable): the `/testapayment` page

A hidden page on the main website for a ₹2 payment through the **exact same** booking flow as `/prep-kit` — same registration dialog, same `POST /sessions/:id/register`, same Razorpay checkout, same verify call, same webhook, same confirmation email. A problem in the real booking flow will show up here too.

One-time setup:

1. Admin panel → create a session, e.g. title "Payment test", slug `payment-test`, price **₹2**, no seat limit (or a large one), **no dates** or a far-future date, **no included PDF**. Publish it.
2. Set `PAYMENT_TEST_SESSION_SLUG=payment-test` on the backend (Cloud Run env var) and redeploy/update.
   - This also **hides that session from the homepage**, which otherwise shows the earliest upcoming session and could pick the ₹2 one.
   - Empty = page turned off (it shows "No test session is set up").

Each test:

1. Open `https://<main-website>/testapayment` → sign in → Pay now → pay ₹2.
2. Verify: success screen, confirmation email, order PAID in admin.
3. Refund it from the Razorpay Dashboard (Part 4) — this frees the account so the same account can pay again. One account can hold only one seat per session.

Notes: the page is not linked anywhere and tells search engines not to index it, but anyone with the URL can pay ₹2 — harmless. The test buyer receives the normal confirmation email and appears in that session's registrations, which is expected.

### Step 5: Do one real end-to-end payment test on the real session

The cleanest way to test the real flow without losing money or leaving messy records:

1. In the admin panel, **increase the session's seat capacity by 1** so real students are unaffected (e.g. 50 → 51)
2. Log in as a **student** (use a personal email, not your admin email)
3. Buy a seat at the real price with your own card — capacity now shows one seat taken (e.g. 51 → 50 remaining)
4. **Verify:** entitlement granted, confirmation email arrives, seat count dropped by 1 in admin
5. Refund yourself **directly in the Razorpay Dashboard** (Live mode → Payments → your payment → Refund)
6. The `refund.processed` webhook fires → access revoked automatically → seat count goes back up → refund confirmation email arrives
7. **Set the capacity back** to the original number (e.g. 51 → 50)

Why this is clean: seats taken = count of active entitlements, computed live (never a stored number). Refunding revokes the entitlement, which frees the seat by itself. The money returns to your card, and the order is recorded as a proper refund with a full audit trail — not an orphaned "paid but revoked" row.

---

## Part 3 — Backfill the 5-6 existing Payment Page buyers

### 3a — Test the backfill script locally first

Do this before touching production. You need your local Docker stack running (`npm run db:up`).

**Step 1: Create a dummy `buyers-test.json`** with one fake entry

```json
[
  {
    "name": "Test Buyer",
    "email": "testbuyer@example.com",
    "whatsappNumber": "9999999999",
    "exam": "UPSC",
    "stage": "Prelims",
    "amountMinor": 100,
    "razorpayPaymentId": "pay_test123",
    "paidAt": "2026-09-01"
  }
]
```

**Step 2: Dry run against your local DB**

```bash
npm run db:backfill:session-buyers -- --session your-session-slug --file buyers-test.json
```

Check the output says "would create account, order ₹1.00, entitlement, registration" — not an error.

**Step 3: Commit it**

```bash
npm run db:backfill:session-buyers -- --session your-session-slug --file buyers-test.json --commit
```

**Step 4: Verify in the local admin panel**

- Log into your local admin → the test buyer should appear with a seat
- Check the DB directly if you like:
  ```sql
  SELECT u.email, e.status, sr.whatsapp_number
  FROM users u
  JOIN entitlements e ON e.user_id = u.id
  JOIN session_registrations sr ON sr.user_id = u.id
  WHERE u.email = 'testbuyer@example.com';
  ```
- All four rows must exist: user, order, entitlement, session_registration

**Step 5: Run it again — idempotency check**

```bash
npm run db:backfill:session-buyers -- --session your-session-slug --file buyers-test.json --commit
```

Output must say **"skipped 1 already seated"** — not create a duplicate.

**Step 6: Clean up the test row (optional)**

Delete the test buyer from your local DB so it doesn't clutter local data. This is local only — no prod impact.

---

### 3b — Run on production

Do this **after** the code is deployed and you have verified the live payment works.

### Step 1: Prepare `buyers.json`

One entry per person. Save the file anywhere on your machine.

```json
[
  {
    "name": "Buyer Name",
    "email": "buyer@gmail.com",
    "whatsappNumber": "9876543210",
    "exam": "UPSC",
    "stage": "Prelims",
    "amountMinor": 49900,
    "razorpayPaymentId": "pay_xxxxx",
    "paidAt": "2026-09-15"
  }
]
```

Field notes:

| Field | Required | Notes |
|---|---|---|
| `name` | Yes | As it should appear in emails |
| `email` | Yes | The address they will sign in with via Google |
| `whatsappNumber` | No | Digits only, e.g. `9876543210` or `919876543210` — both work |
| `exam` | Yes | Must match one of the allowed values in the system |
| `stage` | Yes | Must match one of the allowed values in the system |
| `amountMinor` | Yes | Amount in paise — ₹499 = `49900` |
| `razorpayPaymentId` | No | `pay_...` from the Razorpay dashboard — needed for refunds to work |
| `paidAt` | No | ISO date, e.g. `2026-09-15` — defaults to today if omitted |

### Step 2: Dry run first (writes nothing)

```bash
npm run db:backfill:session-buyers -- --session your-session-slug --file buyers.json
```

Read the output — it tells you what it *would* do for each person. No data is touched.

### Step 3: Commit the data

```bash
npm run db:backfill:session-buyers -- --session your-session-slug --file buyers.json --commit
```

The script is safe to re-run — anyone who already has a seat is skipped automatically.

### Step 4: Verify one buyer

- Log into the admin panel → check that buyer appears with a seat
- That buyer will now receive:
  - Day reminders (with joining link) before each session day
  - Date announcements from the admin
  - Bundled PDF delivery when the admin sends it
  - Correct seat count in the admin's total

---

## Part 4 — Doing refunds before the admin refund button is enabled

The in-app admin refund button is gated by `REFUNDS_ENABLED` (kept `false` for now, so students never see it). But you can still refund anyone cleanly in the meantime — **do it directly in the Razorpay Dashboard**:

1. Razorpay Dashboard (Live mode) → Payments → find the payment → Refund
2. The `refund.processed` webhook fires → backend automatically:
   - Records a row in the `refund` table ("Refunded in the Razorpay dashboard")
   - Marks the order and payment as REFUNDED
   - Revokes the buyer's entitlement → their seat frees up

No script, no manual SQL needed. This keeps every record consistent (order, payment, refund, entitlement all aligned) and is the exact same code path that the admin button will use later.

> **Do NOT revoke access with a hand-written SQL script.** An `UPDATE entitlements SET status='REVOKED'` would free the seat but leave the order still showing PAID, with no refund record — an orphaned, unexplained state. Always refund from the dashboard and let the webhook do the bookkeeping.

**Prerequisite:** `refund.processed` must be ticked in your Live webhook subscription (Part 2, Step 3).

---

## SSL certificate note (Razorpay renewal — Oct 5, 2026)

No action needed. The backend calls Razorpay using Node.js's built-in HTTPS, which automatically trusts any certificate from a recognised authority. No certificate pinning was done, so the renewal is transparent.

To confirm after Oct 5:

```bash
curl -v https://api-ssl-test.razorpay.com
```

`SSL certificate verify ok` means you are fine.
