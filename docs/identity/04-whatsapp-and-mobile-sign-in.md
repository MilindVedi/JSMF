# WhatsApp and mobile sign-in

Signing in — and signing up — with a mobile number, with the one-time code sent
over WhatsApp (and SMS once the DLT template is approved).

**Current state: fully built, switched off.** `PHONE_SIGNIN_ENABLED=false`, so
the storefront shows no mobile option and every mobile endpoint answers 404.
Turning it on is configuration — see [§8](#8-turning-it-on).

---

## 1. Why WhatsApp, and why Meta directly

SMS in India needs a DLT-approved template, and that approval is currently
blocked. WhatsApp has no DLT requirement: Meta approves an
*authentication* template itself, usually within minutes to hours.

Other reasons it is the **preferred** phone channel, not merely a stopgap:

- The code arrives with a **copy-code button**, so there is nothing to retype.
- Most Indian mobile users already have WhatsApp on the number they give.
- Authentication messages are Meta's cheapest category — roughly the same as
  an SMS. *Check Meta's current rate card; pricing changes.*

**Meta's Cloud API directly, not a reseller.** A BSP (MSG91, Gupshup, Interakt…)
adds a per-message markup and a second dashboard for what is, on our side, one
HTTPS call. The port means a reseller could still be added later as one adapter.

SMS stays wired as the **fallback** for a number without WhatsApp. See
[03 — SMS and MSG91](./03-sms-and-msg91.md).

---

## 2. The mobile flow

```
 Number ──► code on WhatsApp ──► verify
                                   │
                  ┌────────────────┴────────────────┐
          number has an account              number is new
                  │                                 │
              signed in                    "What should we call you?"
                                                    │
                                              account created
```

**One flow for sign-in and sign-up, on purpose.** The screen never says "no
account with this number" before the code comes back. Separate sign-in and
sign-up screens would each have to answer "is this number registered?" to
whoever typed it — turning the form into a lookup tool for anyone with a list of
numbers. Here the answer only ever reaches someone holding the phone.

**No password.** The code *is* the credential, every time. A password on a
phone account would be one more secret to leak or forget, protecting nothing the
code does not.

**The name step uses a registration token, not a second code.** After a
successful verify for a new number, the server issues a short-lived, single-use
token bound to that number. The person types their name and the token creates
the account — no second message, no second charge.

### Endpoints

| Route | Auth | Purpose |
| :--- | :--- | :--- |
| `GET /auth/methods` | public | Which sign-in methods are on — how the UI knows to show the button |
| `POST /auth/phone/start` | public | Send a code. Optional `channel: "sms"` after WhatsApp failed |
| `POST /auth/phone/verify` | public | → `signed-in` with a session, or `registration-required` with a token |
| `POST /auth/phone/register` | public | Token + name → new account + session |
| `POST /auth/me/phone/start` | signed in | Send a code to add a number to *this* account |
| `POST /auth/me/phone/verify` | signed in | Confirm it; the number is attached |

All six answer **404 while `PHONE_SIGNIN_ENABLED` is off** — not merely hidden
in the UI, since a route meant not to exist yet should not be reachable through
Swagger either.

---

## 3. Accounts without email

Decided: **a mobile account needs no email.** This is the norm for Indian
consumer apps, and requiring one would bring back the problem mobile sign-in
exists to solve — an email address nobody has verified, which someone could
type on another person's behalf and so block them from signing up with it.

What changed to allow it (migration `20260929120000_phone_accounts`):

| Change | Why |
| :--- | :--- |
| `users.email` nullable | A mobile account has none. The unique index stays: Postgres allows any number of NULLs, so every real address is still unique. |
| `users.phone_verified_at` added | Mirrors `email_verified_at`. Every path that writes `phone` today verifies it, but recording it means a future admin edit cannot quietly break that. |
| `orders.customer_email` nullable | An order from a mobile-only buyer has no email to record. |
| 3 `VerificationPurpose` values | `PHONE_SIGN_IN`, `PHONE_REGISTRATION`, `PHONE_LINK`. |

Consequences, each handled:

- **The purchase receipt goes by WhatsApp instead** — see [§4](#4-purchase-receipts).
- **Checkout prefills the verified phone** into Razorpay instead of an email.
  Razorpay rejects non-string note values, so a null email is omitted from
  notes rather than sent as `null`.
- **Access tokens omit the `email` claim** when there is none. Other JSMF apps
  verifying tokens must not assume it exists.
- **Google sign-in does not merge with a mobile account** — Google links by
  email, and a mobile account has none. Account linking is future work.

---

## 4. Purchase receipts

A buyer with no email still gets a receipt: the same facts, sent to their
verified number as a WhatsApp message.

**One receipt, never two.** Email when there is an address, WhatsApp when there
is only a number. Buyers with both are not messaged twice — a second copy is an
annoyance that also costs money per message, and email is the better carrier for
something worth keeping.

| | Email | WhatsApp |
| :--- | :--- | :--- |
| Buyer's name, items, total, order number | ✓ | ✓ |
| Payment id | ✓ | — |
| Link to the library | in the body | the template's button |

The WhatsApp version is deliberately shorter. Its wording is fixed by the
approved template and read on a phone, so it carries what the buyer needs to
recognise the purchase and leaves the payment id to email, where it is a support
reference rather than something to read.

### It goes to the verified number, not the checkout field

`orders.customer_phone` can hold a number typed into the checkout form, which
nobody has proved they control. A receipt naming what someone bought must not go
to a number a typo makes a stranger's — so the receipt uses
`users.phone` and only when `phone_verified_at` is set.

### A failed receipt never costs the buyer their purchase

The same rule email already followed, now asserted for both channels. By the
time a receipt is sent the money is taken and the entitlement granted; refusing
the settlement because a message bounced would turn a completed purchase into an
error the buyer cannot act on, and leave the webhook retrying something that
already worked. The library is the source of truth for access.

### Two Meta constraints worth knowing

- **It needs its own UTILITY-category template.** Meta prices and approves by
  category and will not let an authentication template carry a receipt. So
  `WHATSAPP_RECEIPT_TEMPLATE_NAME` is separate — and **optional**: without it
  those buyers simply get no receipt, which is a missing courtesy rather than a
  broken purchase.
- **Parameters cannot contain newlines, tabs, or runs of spaces.** Meta rejects
  the whole message rather than trimming. Item titles are admin-entered text, so
  this is reachable from ordinary data entry — every parameter is flattened
  before sending, and an empty one becomes a placeholder. A long order is
  summarised ("Pathology Notes, Surgery Notes and 2 more") rather than truncated
  mid-title, because a cut-off title reads like a broken message.

### The link, and why it is the library rather than the file

The receipt links to the buyer's library, exactly as the email does — **never a
direct download link**. A download URL is signed and expires; anyone the message
was forwarded to could use it until then. The library is behind a sign-in, which
is what makes it safe to put in a message that can be forwarded.

### Suggested template wording

Category **Utility**, four body parameters, plus a **Visit website** button:

```
Hi {{1}}, your JSMF purchase is confirmed.

{{2}}
Paid: {{3}}
Order: {{4}}

Your files are ready to download in your library.
```

| Parameter | Value | Example |
| :--- | :--- | :--- |
| `{{1}}` | buyer's first name | `Ananya` |
| `{{2}}` | what they bought, one line | `Pathology Revision Notes` |
| `{{3}}` | total | `₹199` |
| `{{4}}` | order number | `JSMF-2026-000123` |

**Button:** type *Visit website* → **Dynamic**, URL `https://store.jsmf.me/{{1}}`,
button text `Download your files`. The backend supplies `library` as that
variable.

Dynamic rather than static because Meta fixes a button's **domain** when the
template is approved and only lets the tail vary — which also means the
approved domain and `STOREFRONT_URL` must agree. They are set in two different
places, so a mismatch sends buyers to the wrong site with no error anywhere.
Worth checking once, when the template is created.

The parameter positions live in one function in the Meta adapter
(`receiptParameters`). If the approved wording is ever reordered, that function
changes and nothing else does.

---

## 5. Adding a number to an email account

The library shows an "Add your mobile number" card to email accounts with no
number (only when mobile sign-in is on; dismissible).

**This is what makes the email-failure fallback honest.** When email signup or
password reset cannot send, the person is told "continue with your mobile
number". For an existing email account with no number on file, that would
create a *new, empty* account instead of reaching the one holding their
purchases. A verified number on the account is what routes them back.

If the number already belongs to another account, the refusal comes **after**
the code is verified, never before — refusing up front would tell any signed-in
user which numbers are registered.

---

## 6. Channels, routes, and what a failed send offers

Each channel declares the **kind of address** it delivers to:

| Channel | Address kind | Order |
| :--- | :--- | :--- |
| email | `email` | — |
| whatsapp | `phone` | 1st phone choice |
| sms | `phone` | 2nd phone choice |

A failed send answers with two different kinds of "instead":

- **`alternatives`** — other channels to the **same** destination. WhatsApp
  failed → "send by SMS instead" to the same number. Just a retry with
  `channel: "sms"`.
- **`otherRoutes`** — address kinds the person could **switch to**. Email
  failed → "continue with your mobile number". A different flow, because they
  must give us a number.

Both are computed from which channels are actually switched on, never
hardcoded. There is **no silent fallback**, even WhatsApp→SMS on the same
number: each SMS is paid for, and a code arriving somewhere the person was not
told to look is a code they will not find.

A client asking for a channel that cannot carry the destination (the email
channel on a phone flow) is refused before anything is sent.

**A phone channel counts as available only when `PHONE_SIGNIN_ENABLED` is
also on.** The only way to use a phone channel is through the mobile flow, so
offering it as an alternative while that flow is off would point people at a
screen that does not exist.

---

## 7. Cost controls

Every phone code costs money. The classic abuse — *SMS pumping* — is a script
requesting codes for many numbers from many IPs, which a per-IP limit alone
does not stop. So there are two layers:

| Layer | Default | Setting |
| :--- | :--- | :--- |
| Per IP, on the route | 3 per minute | code (`@Throttle`) |
| Per number, cooldown between sends | 60 s | `PHONE_CODE_RESEND_COOLDOWN_SECONDS` |
| Per number, per hour | 5 | `PHONE_CODE_MAX_PER_HOUR` |

The per-number limits are counted from `verification_codes` itself — no Redis,
no second store to keep in step.

**A send that failed does not count.** The code is retired and marked
`undelivered`, so "send by SMS instead" straight after a WhatsApp failure is not
told to wait 60 seconds.

Only numbers in `SMS_DEFAULT_COUNTRY_CODE` (India) are accepted, which also
closes off international pumping to expensive destinations.

> **Bug the integration test caught:** the first version excluded failed sends
> with a SQL filter `NOT (metadata->undelivered = true)`. For an ordinary row
> with no `undelivered` key that expression is `NULL`, not `true` — so *every*
> row was excluded and the limits never fired. The filter now runs in code.

---

## 8. Turning it on

### Meta setup (once)

1. **Meta Business account** → create a **WhatsApp Business Account** and add a
   phone number that is **not** already registered on the WhatsApp app.
2. **Access token:** Business Settings → System Users → create one, give it the
   WhatsApp app, generate a token with `whatsapp_business_messaging`. *Not* the
   temporary token on the API Setup page — that expires in 24 hours, silently.
3. **Phone number ID:** WhatsApp → API Setup. It is an ID, not the number.
4. **Code template:** WhatsApp Manager → Message templates → new, category
   **Authentication**, with the **Copy code** button. Set **code expiration to
   15 minutes** — expiry lives on the template, not in each message, and must
   match the backend or the message promises a lifetime the server does not
   honour.
5. **Receipt template:** a second template, category **Utility**, with the four
   body parameters in [§4](#suggested-template-wording) and a URL button to the
   library. Optional — without it, mobile-only buyers get no receipt and nothing
   else changes.
6. **Payment method** on the WhatsApp Business Account.

Meta's defaults to be aware of: a **test number** can only message up to five
numbers you verify in the dashboard (error `131030` otherwise), and a new,
unverified business can reach a limited number of unique recipients per day
until **business verification** is done. *Check the current limits in Meta's
docs.*

### Configuration

| Variable | Local | Cloud Run |
| :--- | :--- | :--- |
| `PHONE_SIGNIN_ENABLED` | `true` to try it | `true` when ready to launch |
| `WHATSAPP_DRIVER` | `log` (prints the code) | `meta` |
| `WHATSAPP_ACCESS_TOKEN` | — | Secret Manager |
| `WHATSAPP_PHONE_NUMBER_ID` | — | env var |
| `WHATSAPP_OTP_TEMPLATE_NAME` | — | e.g. `jsmf_verification_code` |
| `WHATSAPP_OTP_TEMPLATE_LANGUAGE` | `en` | must match the template's language |
| `WHATSAPP_RECEIPT_TEMPLATE_NAME` | — | optional; no receipt without it |
| `WHATSAPP_RECEIPT_TEMPLATE_LANGUAGE` | `en` | must match that template's language |
| `STOREFRONT_URL` | `http://localhost:3001` | `https://store.jsmf.me` — where receipts link |
| `WHATSAPP_GRAPH_API_VERSION` | `v23.0` | Meta retires versions ~2 years after release |

Boot refuses: `WHATSAPP_DRIVER=meta` without its three required values;
`WHATSAPP_DRIVER=log` in production; and `PHONE_SIGNIN_ENABLED=true` with no
phone channel configured — a button that can never send a code.

Nothing needs redeploying on the frontend: it asks `GET /auth/methods`.

---

## 9. Architecture

```
shared/whatsapp/                      the transport — knows Meta, not identity
  domain/whatsapp-provider.port.ts    WhatsAppMessage, WhatsAppProvider, errors
  infrastructure/meta-whatsapp.adapter.ts    templates, params, error codes
  infrastructure/log-whatsapp.adapter.ts
  application/whatsapp.service.ts     enabled(), send() → outcome, never throws

modules/identity/
  infrastructure/whatsapp-verification.channel.ts   plugs into VerificationChannel
  application/phone-sign-in.service.ts              the flow; knows no channel
  http/phone-auth.controller.ts                     404 while switched off
  http/delivery-failure.http.ts                     503 shape, shared with email
```

**Requests name a logical message, not a Meta template.** `WhatsAppMessage` is
a union — `authentication-code` and `purchase-receipt` — carrying named fields.
Only the Meta adapter knows which template each maps to and in what order its
parameters go, which is why a caller never has to know the total is parameter
three. For the code template that shape is unusually fiddly (the code is sent
twice: body, and copy-code button as `sub_type: "url"`, Meta's documented
shape), so a test pins the exact payload for both.

**Meta errors are classified by code**, with the fix in the log: `131042`
(billing) becomes a non-retryable failure; `190`, `131030`, `132001` and others
carry a hint naming what to change in the dashboard.

**"Accepted" is not "delivered".** Meta reports delivery later, by webhook — a
number without WhatsApp is usually only known then. There is no webhook
receiver yet; the UI's answer is that "Resend" and "Send by SMS instead" are
always visible on the code screen, because the most common failure is silence,
not an error. A status webhook is the natural enhancement if support volume
calls for it.

---

## 10. Verification

- **72 backend tests pass**, including 11 mobile-flow integration tests against
  the real database (sign-up with no email, returning sign-in however the
  number is typed, single-use token, cooldown, hourly cap, SMS straight after a
  WhatsApp failure, refusing email as a phone channel, linking, refusing a
  number owned by someone else, switched-off state), 7 receipt-routing tests
  (WhatsApp when there is no email, email only when there is one, nothing to an
  unverified number, nothing when WhatsApp is off, purchase survives a failed
  receipt either way, exactly one receipt across repeated settlement) and 18 for
  the Meta adapter.
- **Driven end to end** over HTTP and in a real browser at phone width:
  sign-up to library, adding a number to an email account, and a mobile-only
  buyer completing a real purchase — the receipt appeared addressed to the
  verified number with the right order number, amount and library link. That
  last run is what exposed the `APP_PUBLIC_URL` bug described in
  [gcp/08 §1c](../gcp/08-pending-actions.md).
- **Switched off, verified:** `GET /auth/methods` reports disabled, endpoints
  404, no mobile button on sign-in or sign-up, and `/account/mobile` says it is
  not available yet.

Not verifiable without a Meta account: an actual WhatsApp message. The request
shape is pinned by tests against Meta's documented format.
