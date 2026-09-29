# SMS — one-time codes over MSG91

The second route a verification code can travel, and the answer to "what does
someone do when the email doesn't arrive?"

---

## 1. Why MSG91, and why not Firebase

Firebase Auth was seriously considered and rejected. It is worth recording why,
because the arguments for it are real and will be made again.

**What Firebase genuinely offered:** verification and password-reset emails sent
free and unmetered, which is attractive when Resend's free tier is 100 emails a
day and that limit is the reason buyer signup was switched off once already.

**What made it the wrong choice, in the order the reasons matter:**

- **Firebase does not send a code by email — it sends a link.** Email
  verification and password reset are both "click this to continue". There is no
  email-OTP option; codes exist only for phone. Adopting Firebase would have
  meant abandoning the code-entry flow this platform was specifically built
  around, in favour of one that sends a buyer out to their mail client, onto a
  Firebase-hosted page, and back — losing the page they started on, which is
  worst exactly where most buyers are, on a phone.
- **The free email is Firebase-branded email.** Sending from `jsmf.me` with our
  own wording requires configuring a custom SMTP server inside Firebase — which
  would have been Resend. The saving evaporates the moment the email needs to
  look professional.
- **It would not have removed the `users` table.** Orders, entitlements and
  roles all key off it. Firebase would have added a second source of identity to
  keep in sync, not replaced the first.
- **Phone auth is the expensive part.** Firebase charges per verification, at
  roughly two orders of magnitude more than MSG91 for Indian numbers — so the
  one thing Firebase does that is genuinely hard to build ourselves was also the
  one thing we could not afford to use it for.

Netting it out: Firebase would have removed **about half** of email volume — the
purchase confirmation still has to go through Resend, because Firebase cannot
send it — in exchange for a rewrite, a worse signup flow, and generic emails.
The saving is a $20/month Resend plan that only becomes necessary at roughly 40
customers a day, which is a point at which $20 is not a decision.

**The decision: keep JSMF's own identity system, keep Resend for all email, and
use MSG91 for SMS only.** Recharge Resend when volume requires it.

---

## 2. Where SMS sits

```
AccountRecoveryService            "get this code to this person"
        │                          knows nothing about mediums
        ▼
VerificationDeliveryService       picks a channel, reports alternatives
        │
        ├── EmailVerificationChannel ──► MailService ──► Resend
        └── SmsVerificationChannel   ──► SmsService  ──► MSG91
```

Two boundaries, each earning its place:

**`VerificationChannel`** (in `identity/domain/`) is what makes email and SMS
interchangeable to the flows above. Adding SMS was one class and one line in
`VerificationDeliveryService`'s channel list — `startSignup`,
`startPasswordReset` and the controllers were not touched. That was the claim
the port was built on, and it held.

**`SmsProvider`** (in `shared/sms/`) is what keeps the vendor out of identity.
Nothing in the identity module contains the string "MSG91". SMS lives in
`shared/` rather than inside identity for the same reason mail does: one-time
codes are merely the *first* thing that needs text messages, not the only thing
— order updates are the obvious next caller.

### The same code, either way

Both channels carry **the same code**, issued by `VerificationCodeService` and
stored as a hash. This is why MSG91's own OTP API — which generates, stores and
verifies codes itself — is deliberately **not** used, in favour of the Flow API
that sends a message we compose.

Letting MSG91 own the code would create two different notions of what a valid
code is, and would make the central promise of the whole design impossible: that
when email fails, the *same still-valid code* can be re-sent by text.

---

## 3. What DLT means for this

Indian SMS is regulated. Under TRAI's DLT regime the exact wording of a
transactional message must be registered with the regulator and approved before
a single message can be sent. The sender then supplies only the template id and
the blanks.

Three consequences that are easy to be caught out by:

- **The message text is not in this repository and cannot be.** Changing the
  wording means re-registering with the regulator, not editing a file.
- **Variable names must match exactly.** The approved template must use `OTP`
  and `EXPIRY`, because that is what `SmsVerificationChannel` sends. A mismatch
  is rejected outright — which is the better failure, since the alternative
  would be a blank code delivered to a real person.
- **Approval takes days, not minutes.** Account, sender ID and template are all
  prerequisites, so they are worth starting well before the flow is needed.

The approved template:

```
{{OTP}} is your JSMF verification code. It is valid for {{EXPIRY}} minutes.
Do not share it with anyone.
```

---

## 4. Phone numbers are normalised once, at the edge

`shared/sms/domain/phone-number.ts`, with its own tests.

`+91 98765 43210`, `098765 43210` and `9876543210` are one person. The phone
column is `@unique`, so if two spellings ever reach the database that person has
two accounts — and the purchases on the second cannot be moved to the first
without a human deciding who owns what. That failure surfaces months later, in
support, not in a stack trace.

So every number is reduced to E.164 digits with no `+` (`919876543210`) before
it goes anywhere, and the **same function** is used for storing and for sending,
which is what guarantees the two agree.

Two cases the tests pin down because they are the ones that break quietly:

- **`9186543210`** is a real Indian mobile that begins with the country code.
  Naively stripping the leading `91` leaves eight digits and rejects a valid
  number — for a minority of users, invisibly.
- **Anything outside the `[6-9]` ten-digit mobile range** is rejected at the
  form. A landline or short code accepted here fails silently at the provider,
  leaving someone waiting for a code that was never going anywhere.

Masking (`+********3210`) exists for the "we sent a code to…" screen, which is
visible to whoever asked — not necessarily the account's owner.

---

## 5. Configuration

| Variable | Values | Notes |
| :--- | :--- | :--- |
| `SMS_DRIVER` | `none` (default), `log`, `msg91` | `none` is valid in production |
| `SMS_DEFAULT_COUNTRY_CODE` | `91` | assumed when no country code is typed |
| `MSG91_AUTH_KEY` | | required when `msg91` |
| `MSG91_OTP_TEMPLATE_ID` | | required when `msg91`; the DLT template |
| `MSG91_SENDER_ID` | e.g. `JSMFIN` | optional; MSG91 falls back to the template's |

**`SMS_DRIVER` controls more than the transport.** `SmsService.enabled()` reads
it, `SmsVerificationChannel.isConfigured()` returns it, and
`VerificationDeliveryService.available()` filters on that — so the "continue
with your mobile number instead" alternative appears to buyers **only** when SMS
is genuinely wired up. Offering a route that cannot send is worse than offering
none: it turns a recoverable problem into a dead end the person was told would
work.

`SMS_DRIVER=log` prints codes instead of sending them, so the flow is
exercisable before the regulator has approved anything. It is **refused in
production** by env validation — a live one-time code in a log file is a
credential in plaintext. Note that `none` is allowed there and `log` is not:
running without SMS is a product decision, logging codes is a security problem.

### No delivery table

Email records every send to `email_deliveries`, because no provider reports
remaining allowance and the free tier is small enough to outgrow by accident.
SMS deliberately has no equivalent: MSG91 is prepaid with a balance visible in
its own dashboard, so a table here would duplicate a number somebody else
already maintains, at the cost of a migration. If per-message auditing is ever
needed — a dispute over whether a code was sent — that is the moment to add one,
shaped like `email_deliveries`.

---

## 6. Failure handling

`SmsBalanceExhaustedError` is separated from `SmsDeliveryError` for the same
reason mail separates quota from error: it is neither a bug nor transient, so
"try again shortly" would be a lie.

One difference from email is worth knowing. **An email allowance resets; a
prepaid SMS balance does not.** An exhausted mail quota fixes itself at
midnight, while an empty MSG91 account stays empty until somebody pays — so the
log line for it is deliberately louder, and classifying it correctly matters
more here, not less.

MSG91 signals it only in the wording of its error message, so the adapter
matches on text. That is brittle and acknowledged as such; the alternative is
telling a locked-out buyer to retry something that cannot succeed.

---

## 7. Status

| Piece | State |
| :--- | :--- |
| `SmsProvider` port, `log` and `msg91` adapters | **Built.** |
| `SmsVerificationChannel`, registered in the delivery list | **Built.** |
| Phone normalisation | **Built**, 12 tests passing. |
| Env validation and production guards | **Built.** |
| MSG91 account, DLT sender ID, approved template | **Not done** — see [gcp/08 — Pending Actions](../gcp/08-pending-actions.md). |
| Signing up *with* a mobile number | **Built** — [04](./04-whatsapp-and-mobile-sign-in.md), with WhatsApp as the first channel. |

### Mobile sign-in now exists

This section used to say that signing up *with* a mobile number was not built.
It now is — see [04 — WhatsApp and mobile sign-in](./04-whatsapp-and-mobile-sign-in.md).
SMS is the second phone channel there, behind WhatsApp, and is offered as
"send by SMS instead" once `SMS_DRIVER=msg91` is live.

Note also that the SMS channel now reports itself available only when
`PHONE_SIGNIN_ENABLED` is on as well as `SMS_DRIVER` — a phone channel is only
reachable through the mobile flow.
