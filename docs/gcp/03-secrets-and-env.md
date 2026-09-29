# GCP Environment Variables & Secret Manager Mapping

This document provides a reference for all environment variables, flags, and secret configurations needed for deploying the JSMF V1 stack on GCP.

---

## 1. Backend (`NestJS`) Environment & Secret Configuration

| Variable Name | Type | In V1 (Free / Low Cost) | Source / Secret Manager Key | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `NODE_ENV` | String | `production` | Cloud Run Env Var | Controls logging, helmet, swagger disable. |
| `PORT` | Number | `4000` | Cloud Run Env Var | Cloud Run container listening port. |
| `CORS_ORIGINS` | CSV String | `https://your-frontend-app.run.app` | Cloud Run Env Var | Allowed origins for browser credentials. |
| `APP_PUBLIC_URL` | URL | `https://your-backend-app.run.app/api` | Cloud Run Env Var | API base URL for signed callbacks / public asset generation. |
| `DATABASE_URL` | Connection URL | `postgresql://...` | GCP Secret: `DATABASE_URL` | Cloud SQL socket or external connection string. |
| `JWT_PRIVATE_KEY_BASE64` | Base64 RSA Private Key | `LS0t...` | GCP Secret: `JWT_PRIVATE_KEY_BASE64` | Base64 string of RSA PEM private key. |
| `JWT_PUBLIC_KEY_BASE64` | Base64 RSA Public Key | `LS0t...` | GCP Secret: `JWT_PUBLIC_KEY_BASE64` | Base64 string of RSA PEM public key. |
| `JWT_KEY_ID` | String | `jsmf-identity-1` | Cloud Run Env Var | Key ID for rotation support. |
| `JWT_ISSUER` | String | `jsmf-identity` | Cloud Run Env Var | JWT Issuer field. |
| `JWT_AUDIENCE` | String | `jsmf` | Cloud Run Env Var | JWT Audience field. |
| `STORAGE_DRIVER` | Enum | `gcs` | Cloud Run Env Var | `local` \| `cloudinary` \| `gcs`. Controls **writes only** — reads always go to the provider each row records, so switching never strands existing files. |
| `STORAGE_SIGNING_SECRET`| String (min 16 chars) | `<Random_Secret>` | GCP Secret: `STORAGE_SIGNING_SECRET` | Used for generating signed internal URLs. |
| `STORAGE_PRIVATE_BUCKET`| String | `jsmf/private` | Cloud Run Env Var | Cloudinary folder prefix for raw/private PDFs. |
| `STORAGE_PUBLIC_BUCKET` | String | `jsmf/public` | Cloud Run Env Var | Cloudinary folder prefix for covers/images. |
| `CLOUDINARY_CLOUD_NAME` | String | `<your-cloud-name>` | GCP Secret: `CLOUDINARY_CLOUD_NAME` | Cloudinary account identifier. |
| `CLOUDINARY_API_KEY` | String | `<your-api-key>` | GCP Secret: `CLOUDINARY_API_KEY` | Cloudinary API Key. |
| `CLOUDINARY_API_SECRET` | String | `<your-api-secret>` | GCP Secret: `CLOUDINARY_API_SECRET` | Cloudinary API Secret. Keep set after moving to GCS — existing Cloudinary objects are still read through it. |
| `GCS_PRIVATE_BUCKET` | String | `jsmf-private-509708` | Cloud Run Env Var | Purchased files. Public access prevention **enforced**. Dev uses `jsmf-dev-private-509708`. |
| `GCS_PUBLIC_BUCKET` | String | `jsmf-public-509708` | Cloud Run Env Var | Cover images. `allUsers:objectViewer`. Must differ from the private bucket — boot fails otherwise. Dev uses `jsmf-dev-public-509708`. |
| `GCS_PROJECT_ID` | String | `production-509708` | Cloud Run Env Var | Optional; inferred from ADC when unset. |

> 🔑 **GCS needs no credential in configuration.** The adapter uses Application
> Default Credentials — the attached service account on Cloud Run. There is
> deliberately no key-file setting, because a JSON key is a long-lived
> credential that has to be stored somewhere and buys nothing here.
>
> What it does need is two IAM grants, and the second is the one that gets
> missed:
>
> ```
> roles/storage.objectAdmin              on each bucket
> roles/iam.serviceAccountTokenCreator   on the service account ITSELF
> ```
>
> The second is required because a V4 signed URL has to be signed, and with no
> private key the SDK signs through the IAM `signBlob` API. Uploads, deletes
> and public covers all work without it — only paid downloads fail, and they
> fail at the moment a customer tries to download something they have bought.

> 🧪 **Four buckets in total — one pair per environment.**
>
> | | Private | Public |
> | :--- | :--- | :--- |
> | **Cloud Run** | `jsmf-private-509708` | `jsmf-public-509708` |
> | **Local / dev** | `jsmf-dev-private-509708` | `jsmf-dev-public-509708` |
>
> The split exists so local development cannot write into the buckets
> customers are served from. Sharing them would make a dev upload a live
> product's file and a dev delete a real deletion, with nothing in the code to
> distinguish the two.
>
> **Local credentials are scoped, and deliberately not your own.**
> `jsmf-local-dev@production-509708.iam.gserviceaccount.com` holds
> `roles/storage.objectAdmin` on the two dev buckets and **no project-level
> role at all**. Verified by attempting, as that identity, to write to the
> production bucket (403), read it (denied), list Secret Manager (denied) and
> list Cloud Run services (denied).
>
> ```bash
> gcloud auth application-default login >   --impersonate-service-account=jsmf-local-dev@production-509708.iam.gserviceaccount.com
> ```
>
> Then set `GCLOUD_CONFIG_DIR` in the repo-root `.env` so
> `docker-compose.dev.yml` can mount the credentials read-only.
>
> **Impersonation, not a downloaded key.** The org policy
> `constraints/iam.disableServiceAccountKeyCreation` is enforced on this
> project, and that is the right setting: impersonated credentials are
> short-lived and expire on their own, whereas a key file is a permanent
> credential that stays valid until someone notices it leaked. The scoping
> benefit is identical either way.
>
> Without `--impersonate-service-account`, the same mount hands the container
> your personal credentials, which on this project are Owner. The flag is what
> makes the arrangement least-privilege rather than the opposite.

> 🔒 **Two buckets, not one with prefixes.** With uniform bucket-level access,
> visibility is a property of the bucket. The private bucket has no public
> access to grant, so a bug in the adapter cannot publish a purchased PDF —
> the worst it can do is put a cover image somewhere private, which fails
> visibly. Sharing one bucket would make "is this file paid?" a per-object
> question, and one wrong write would silently publish a product.
| `PAYMENT_DRIVER` | Enum | `razorpay` | Cloud Run Env Var | Production payment gateway driver. |
| `RAZORPAY_KEY_ID` | String | `<your-key-id>` | GCP Secret: `RAZORPAY_KEY_ID` | Razorpay public key. |
| `RAZORPAY_KEY_SECRET` | String | `<your-key-secret>` | GCP Secret: `RAZORPAY_KEY_SECRET` | Razorpay private secret. |
| `REDIS_ENABLED` | Boolean | `false` | Cloud Run Env Var | Keep `false` in V1 for lowest cost ($0). |
| `RATE_LIMIT_PER_MINUTE` | Number | *(leave unset — 120)* | Cloud Run Env Var | Per-caller limit, counted per account when signed in. Tunable without a rebuild; the default is an estimate that real traffic should settle. |
| `RATE_LIMIT_IP_CEILING_PER_MINUTE` | Number | *(leave unset — 3000)* | Cloud Run Env Var | Per-IP backstop. Must be >= `RATE_LIMIT_PER_MINUTE` or the app refuses to start. |
| `TRUST_PROXY_RANGES` | CSV String | *(leave unset)* | Cloud Run Env Var | Which upstream addresses are trusted proxies, for resolving the real client IP that rate limiting counts on. The built-in default already covers Cloud Run, Firebase Hosting and Google load balancers - **only set this if a new proxy is added**. See *Phase 9.1*. |
| `PASSWORD_SIGNUP_ENABLED` | Boolean | `true` (default) | Cloud Run Env Var | Buyers may sign up with a password or with Google. Registration sends no email, so the mail quota cannot block it. Set `false` to make `POST /auth/register` answer 404. |
| `GOOGLE_OAUTH_ENABLED` | Boolean | `true` | Cloud Run Env Var | Enables Google OAuth 2.0 authentication. |
| `GOOGLE_CLIENT_ID` | String | `<your-client-id>` | Cloud Run Env Var / Secret | Google Cloud OAuth Client ID (e.g. `569375141363-...apps.googleusercontent.com`). |
| `GOOGLE_CLIENT_SECRET` | String | `<your-client-secret>` | GCP Secret: `GOOGLE_CLIENT_SECRET` | Google Cloud OAuth Client Secret (`GOCSPX-...`). |
| `GOOGLE_CALLBACK_URL` | URL | `https://store.jsmf.me/api/auth/google/callback` | Cloud Run Env Var | Registered OAuth redirect URL matching Google Console. |
| `OAUTH_ALLOWED_REDIRECTS` | CSV String | `https://store.jsmf.me/auth/callback,https://jsmf.me/auth/callback` | Cloud Run Env Var | Strict allowlist of frontend URLs permitted to receive session tokens after OAuth. |
| `OAUTH_STATE_SECRET` | String (min 16 chars) | `<Random_Secret>` | GCP Secret: `OAUTH_STATE_SECRET` | Cryptographic key used to sign and verify OAuth state parameter. |
| `MAIL_DRIVER` | Enum | `resend` | Cloud Run Env Var | HTTPS API, not an SMTP socket — Cloud Run blocks outbound SMTP ports. `log` is **refused in production** by env validation. |
| `RESEND_API_KEY` | String | `re_...` | GCP Secret: `RESEND_API_KEY` | Required when `MAIL_DRIVER=resend`. Create at https://resend.com/api-keys. |
| `MAIL_FROM` | String | `JSMF <no-reply@jsmf.me>` | Cloud Run Env Var | Verified domain in Resend (https://resend.com/domains). |
| `SMS_DRIVER` | Enum | `none` | Cloud Run Env Var | `none` is a **valid production value** — SMS is optional. `log` is refused in production (a one-time code in a log file is a plaintext credential). Set to `msg91` only once the DLT template is approved: it is also what decides whether buyers are *offered* a mobile route at all. |
| `SMS_DEFAULT_COUNTRY_CODE` | Digits | `91` | Cloud Run Env Var | Assumed when a number is typed without a country code. |
| `MSG91_AUTH_KEY` | String | `<auth key>` | GCP Secret: `MSG91_AUTH_KEY` | Required when `SMS_DRIVER=msg91`. |
| `MSG91_OTP_TEMPLATE_ID` | String | `<template id>` | Cloud Run Env Var | Required when `SMS_DRIVER=msg91`. The DLT-approved template; its variables must be named `OTP` and `EXPIRY`. |
| `MSG91_SENDER_ID` | String (6 chars) | `JSMFIN` | Cloud Run Env Var | Optional — MSG91 falls back to the template's own sender. Must be DLT-registered. |
| `PHONE_SIGNIN_ENABLED` | Boolean | `false` | Cloud Run Env Var | Whether mobile sign-in exists at all. Off: no button in any client, every `/auth/phone/*` route 404s. On requires WhatsApp or SMS to be configured, or boot fails. |
| `PHONE_CODE_RESEND_COOLDOWN_SECONDS` | Number | `60` | Cloud Run Env Var | Per number. Failed sends do not count. |
| `PHONE_CODE_MAX_PER_HOUR` | Number | `5` | Cloud Run Env Var | Per number — the limit that stops SMS/WhatsApp pumping, which a per-IP limit does not. |
| `WHATSAPP_DRIVER` | Enum | `meta` | Cloud Run Env Var | `none` is valid in production; `log` is refused there. |
| `WHATSAPP_ACCESS_TOKEN` | String | `EAA...` | GCP Secret: `WHATSAPP_ACCESS_TOKEN` | Required when `meta`. A **System User** token — the API Setup page's temporary token expires in 24 h. |
| `WHATSAPP_PHONE_NUMBER_ID` | String | `1234567890` | Cloud Run Env Var | Required when `meta`. The *Phone number ID* from WhatsApp → API Setup, not the number. |
| `WHATSAPP_OTP_TEMPLATE_NAME` | String | `jsmf_verification_code` | Cloud Run Env Var | Required when `meta`. An approved **Authentication** template with a copy-code button and a **15-minute** expiry. |
| `WHATSAPP_OTP_TEMPLATE_LANGUAGE` | String | `en` | Cloud Run Env Var | Must match the template's language exactly (`en` ≠ `en_US`). |
| `WHATSAPP_RECEIPT_TEMPLATE_NAME` | String | `jsmf_purchase_receipt` | Cloud Run Env Var | Optional. An approved **Utility** template for purchase receipts to buyers with no email. Without it those buyers get no receipt; the purchase is unaffected. |
| `WHATSAPP_RECEIPT_TEMPLATE_LANGUAGE` | String | `en` | Cloud Run Env Var | Must match that template's language. |
| `STOREFRONT_URL` | URL | `https://store.jsmf.me` | Cloud Run Env Var | The **buyer-facing site**, where purchase receipts link. Not `APP_PUBLIC_URL`, which is this API's own base URL and ends in `/api` — using it produced receipt links to `…/api/library`, a page that does not exist. |
| `WHATSAPP_GRAPH_API_VERSION` | String | `v23.0` | Cloud Run Env Var | Meta retires Graph API versions roughly two years after release. |
| `PAYMENT_RECONCILIATION_TRIGGER` | Enum | `http` | Cloud Run Env Var | `http` on Cloud Run: an in-process `cron` cannot fire at `--min-instances=0`. No app secret involved — Cloud Scheduler authenticates as an IAM identity granted `roles/run.invoker`, same as the frontend. See *Phase 9.2*. |

---

## 2. Frontend (`pdf-web` Next.js) Configuration

| Environment Variable | Description | Example Production Value |
| :--- | :--- | :--- |
| `BACKEND_API_URL` | URL of the NestJS backend API. Resolved at **runtime** by `middleware.ts` to dynamically reverse proxy requests. | `https://jsmf-backend-67890.a.run.app` |
| `NEXT_PUBLIC_SITE_URL` | The one public address the site is published at. Drives `<link rel="canonical">` and absolute metadata URLs. **Must be set on every deployed environment** — see the note below. | `https://store.jsmf.me` |
| `NEXT_PUBLIC_MAX_UPLOAD_MB`| Max client file size in MB | `10` |
| `PORT` | Listening Port | `3001` |
| `NODE_ENV` | Production Environment | `production` |

> 💡 **Note on Runtime Proxying:** In V1, the Next.js app does NOT bake backend URLs into static client assets during build time. Instead, the browser makes API calls to relative paths (e.g. `/api/users`), and Next.js `middleware.ts` dynamically intercepts and forwards them to `BACKEND_API_URL` at runtime.

> ⚠️ **Why `NEXT_PUBLIC_SITE_URL` cannot be derived from the request.** The app
> answers on **five** hostnames, all serving the identical site:
>
> | Hostname | Where it comes from | Removable? |
> | :--- | :--- | :--- |
> | `store.jsmf.me` | the custom domain — **the canonical one** | — |
> | `jsmfstore.stackmint.live` | an earlier custom domain | Yes, if no longer wanted |
> | `production-509708.web.app` | Firebase Hosting's automatic domain | **No** — provisioned per site |
> | `production-509708.firebaseapp.com` | Firebase Hosting's automatic domain | **No** — provisioned per site |
> | `jsmf-pdf-web-….a.run.app` | the Cloud Run service itself | Only via ingress restriction |
>
> **Firebase rewrites the `Host` header** to the `.run.app` name on the way
> through: requests to both `store.jsmf.me` and `production-509708.web.app`
> appear in Cloud Run's own request logs as `https://jsmf-pdf-web-….run.app/…`.
> `x-forwarded-host` is no help either,
> because Next.js synthesises that header from `Host` when no proxy set one, so
> it reports the `.run.app` name too and is indistinguishable from a real proxy
> header.
>
> Two consequences. First, any absolute URL the app emits must come from this
> variable, or it will name the Cloud Run URL. Second, **a canonical-host
> redirect in `middleware.ts` is not possible** — both candidate signals match
> every request, so such a redirect would bounce all traffic to the canonical
> domain, back through Firebase, into the same check again, looping until the
> site is unreachable. This was measured, not assumed. `alternates.canonical`
> in `src/app/layout.tsx` is what makes search engines treat the extra
> hostnames as the same pages, and it covers all five at once because every one
> of them serves the same tag. Genuinely closing a door needs an infrastructure
> change, not application code — and two of the five cannot be closed at all,
> since Firebase does not allow its automatic `.web.app` and `.firebaseapp.com`
> domains to be removed.

---

## 3. RSA Key Generation Utility

To quickly generate valid RSA keys for `JWT_PRIVATE_KEY_BASE64` and `JWT_PUBLIC_KEY_BASE64`:

```bash
# Generate private key
openssl genrsa -out private.pem 2048

# Extract public key
openssl rsa -in private.pem -outform PEM -pubout -out public.pem

# Encode to Base64 (Linux/macOS)
JWT_PRIVATE_KEY_BASE64=$(base64 -w 0 private.pem)
JWT_PUBLIC_KEY_BASE64=$(base64 -w 0 public.pem)

# Windows PowerShell:
# [Convert]::ToBase64String([IO.File]::ReadAllBytes("private.pem"))
# [Convert]::ToBase64String([IO.File]::ReadAllBytes("public.pem"))
```
