# Pending actions

Things that are **built and documented but not yet applied to a running
environment**, or that need a decision. Separate from
[05 — Scaling Roadmap](./05-scaling-roadmap-todos.md), which is about what to
do as the product grows: everything here is about the gap between what the
repository says and what is currently live.

Ordered by consequence.

---

## 🟠 1. SMS / WhatsApp Delivery Configuration

### 1a. WhatsApp Mobile Sign-in (Recommended)
`PHONE_SIGNIN_ENABLED=false`. Code and tests are built.
Steps in [identity/04 §8](../identity/04-whatsapp-and-mobile-sign-in.md#8-turning-it-on):
Business account → WhatsApp number → System User token → Authentication template (copy-code button, 15-minute expiry) → **Utility template for purchase receipts** → payment method. Then:

```powershell
gcloud run services update jsmf-backend --region=asia-south1 `
  --update-env-vars=PHONE_SIGNIN_ENABLED=true,WHATSAPP_DRIVER=meta,WHATSAPP_PHONE_NUMBER_ID=<id>,WHATSAPP_OTP_TEMPLATE_NAME=<name>,WHATSAPP_RECEIPT_TEMPLATE_NAME=<name> `
  --update-secrets=WHATSAPP_ACCESS_TOKEN=WHATSAPP_ACCESS_TOKEN:latest
```

### 1c. Purchase receipt links point at the API, not the storefront

Independent of WhatsApp, and it affects **email receipts that already go out**.
The "view your library" link was built from `APP_PUBLIC_URL`, which is this
API's own base URL ending in `/api` — so every purchase confirmation has linked
to `…/api/library`, a page that does not exist. Fixed in code by a new
`STOREFRONT_URL`, which defaults to localhost and so must be set on Cloud Run:

```powershell
gcloud run services update jsmf-backend --region=asia-south1 `
  --update-env-vars=STOREFRONT_URL=https://store.jsmf.me
```

Worth doing **before** the WhatsApp work: it fixes a live bug in the email
receipts customers are getting today.

---

### 1b. SMS Fallback (via MSG91)
`SMS_DRIVER=none`. If SMS fallback is required alongside WhatsApp:
1. MSG91 account with credit.
2. DLT-registered sender ID (e.g. `JSMFIN`).
3. DLT-approved template with `OTP` and `EXPIRY` variables.

```powershell
gcloud run services update jsmf-backend --region=asia-south1 `
  --update-env-vars=SMS_DRIVER=msg91,MSG91_OTP_TEMPLATE_ID=<id>,MSG91_SENDER_ID=JSMFIN `
  --update-secrets=MSG91_AUTH_KEY=MSG91_AUTH_KEY:latest
```

---

## 🟡 2. Admin App Invitation URL
Set `ADMIN_APP_URL` on the backend so admin invitation email links point to production:

```powershell
gcloud run services update jsmf-backend --region=asia-south1 `
  --update-env-vars=ADMIN_APP_URL=https://store.jsmf.me
```

---

## 🟡 3. Schema changes awaiting review

**`20260929120000_phone_accounts`** — mobile accounts:

```sql
ALTER TYPE "VerificationPurpose" ADD VALUE 'PHONE_SIGN_IN';
ALTER TYPE "VerificationPurpose" ADD VALUE 'PHONE_REGISTRATION';
ALTER TYPE "VerificationPurpose" ADD VALUE 'PHONE_LINK';
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "users" ADD COLUMN "phone_verified_at" TIMESTAMPTZ(6);
ALTER TABLE "orders" ALTER COLUMN "customer_email" DROP NOT NULL;
```

**`20260927234307_password_changed_revoke_reason`** — one additive enum value:

```sql
ALTER TYPE "RefreshTokenRevokedReason" ADD VALUE 'PASSWORD_CHANGED';
```

---

## 🟡 4. Backend `max-instances` is 2, not 3

The intent was 3. Update if higher concurrency is required.

---

## Not pending, recorded to prevent re-litigation

- **A canonical-host redirect in `middleware.ts` is not possible.** Firebase
  rewrites `Host` to the `.run.app` name, and Next.js synthesises
  `x-forwarded-host` from `Host` — so both candidate signals match every
  request and a redirect would loop the site into unreachability. Measured, not
  assumed.
- **Service-account keys cannot be created in this project**
  (`constraints/iam.disableServiceAccountKeyCreation` is enforced), and should
  not be. Impersonation gives the same scoping with credentials that expire.
- **Firebase Auth was evaluated and rejected** for email verification and
  password reset. Its free, unmetered auth email is real, but it sends a *link*
  rather than a code — there is no email-OTP option — and sending from `jsmf.me`
  requires pointing Firebase at an SMTP provider, which would have been Resend
  anyway. The reasoning in full:
  [identity/03 — SMS and MSG91](../identity/03-sms-and-msg91.md#1-why-msg91-and-why-not-firebase).
- **There is no forgot-password gap any more** — the flow exists. What remains
  absent is any recovery path for a buyer who can neither receive email nor use
  Google, which is what the SMS channel is for.
