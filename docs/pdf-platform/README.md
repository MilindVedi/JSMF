# JSMF PDF & Digital Content Platform

This folder documents the **JSMF PDF platform** — a separate product from the PYQ question-bank application, shipping *before* it, and the first part of JSMF to have a real backend, real payments, and real user accounts.

## Why this exists as its own product

The PYQ application documented in the top-level [`docs/`](../README.md) is a study *tool*: a question bank a student practises against. The PDF platform is a **content storefront**: a place where a doctor publishes a study resource, shares its link from YouTube or Instagram, and a student discovers, buys (or downloads free), and keeps it in their library.

They share a brand, a user account, and eventually a library — but they are different products with different data, different screens, and different release timelines, so they are documented separately rather than folded into the PYQ docs.

## Status

The backend exists and is verified — not a mock. Each piece below is documented in [02 — Architecture](./02-architecture.md) under its own **Status: built** heading, which says what was implemented, what decisions were made, and how it was tested against the running API:

| Piece | State |
|---|---|
| **Identity** (register/login/refresh/logout, RS256 signing, JWKS) | Built. Platform-wide, not PDF-specific — documented in its own folder, [`docs/identity/`](../identity/README.md), not here. 14 assertions, including reuse-detection forensics. |
| **Storage** (local + Cloudinary + GCS adapters behind one port) | Built; **GCS is the current driver**. Private objects live in a bucket with public access prevention enforced and are served only through V4 signed URLs; covers are served unsigned. Verified against real buckets: anonymous read of a private object is refused (403), a signed one succeeds, and the `signBlob` signing path Cloud Run depends on was exercised end to end. Cloudinary remains configured and readable — production rows have **not** been migrated yet. See [05 — Storage](./05-storage.md). |
| **Payments** (stub + Razorpay adapters behind one port) | Built and **verified against the live Razorpay test API** — a real order created and independently confirmed via Razorpay's own API, and the real checkout widget driven in a browser. The stub mirrors Razorpay's real HMAC mechanics rather than always returning success. |
| **Catalog** (products, versioned assets, taxonomy, admin + public APIs) | Built. Includes soft delete on products, taxonomy terms, and product links. 69 + 19 assertions, including a live test that adds a brand-new category kind through the API with no code change. |
| **Orders, checkout, webhooks, entitlements, downloads** | Built. **Verified against the live Razorpay test API**, not just the stub — a real order was created and independently confirmed via Razorpay's own API. 42 + 12 assertions. |
| **Admin panel UI** | Built — `pdf-web/src/app/(admin)/admin/`. Login, product list/create/edit, PDF + cover upload with versioning, category assignment, links, publish/unpublish/archive. Verified in a real browser: 22 assertions. First part of the frontend on the real backend. |
| **Public storefront UI** | Built — `pdf-web/src/app/(store)/`. Browse with taxonomy filters, the shareable `/p/{slug}` product page, buyer signup/login, Razorpay checkout, and My Library. Verified in a real browser against live Razorpay test keys: 23 assertions. |
| **Buyer signup with email verification, password reset** | Built. Signup is two steps — a six-digit code is emailed and **no account is created until it comes back**. Password reset mirrors it and revokes every live session. When a code cannot be delivered, the response carries `reason` and `alternatives` so the UI offers another way in rather than a dead end; delivery sits behind a `VerificationChannel` port so adding SMS is one adapter. Driven end to end in a browser. See [`docs/identity/`](../identity/README.md). |
| **Admin order management, refunds** | Built. `GET/POST /admin/orders*` (ADMIN role only) lists every customer's orders with status/search filters and pagination, and `POST /admin/orders/:id/refund` calls the payment provider's real refund API, records a `Refund` row, and revokes every entitlement the order granted — all in one transaction. Free orders (₹0) refund locally without calling the provider, since there is nothing to return. Not yet tested against a live Razorpay refund; verified against the stub adapter, which mirrors the real refund status vocabulary. |
| **Admin onboarding by invitation, Google sign-in** | Built. Admins are created by invitation from an existing admin (`/admin/team`) — there is no public way to request access, and `npm run db:seed` creates a bootstrap admin only when none exists. Google sign-in works for buyers and invited admins, and is platform-wide (allowlisted redirects) so the PYQ app can use the same flow. Email sits behind a `MailProvider` port. See [`docs/identity/`](../identity/README.md). Verified in a real browser: 10 assertions. Google itself is off until credentials are configured. |
| **Full-stack Docker** (Postgres, Redis, API, `pdf-web`) | Built. Root-level `docker-compose.yml` runs all four; the API container applies its own Prisma migrations on start. See [02 — Architecture](./02-architecture.md) for exact commands and what was verified. |
| Razorpay webhook in production | Needs the dashboard webhook + its secret (below). Local checkout settles through the browser callback, which is why the flow works end to end without it — but in production the webhook is the authority. |

Razorpay is configured with live test credentials and verified working. Storage
has moved to Google Cloud Storage; Cloudinary is retained only so that objects
uploaded before the switch stay readable.

Open items:

1. **Migrate production storage to GCS.** Production rows still name `CLOUDINARY` and are still served from it. The dev database has been migrated and verified; production has not. The procedure, and why the Cloudinary credentials must stay configured until it is done, are in [05 — Storage](./05-storage.md).
2. **Cloudinary's 10 MiB raw-upload cap** no longer constrains new uploads, since those go to GCS. It still applies to anything being read back from Cloudinary, which is why the cap was the trigger for moving in the first place. `MAX_UPLOAD_SIZE_MB` can be raised once production rows are migrated.

Day-to-day development writes to a **separate pair of dev buckets** under a
service account that can reach nothing else in the project, so local work
cannot touch the files customers are served.

## How documentation is organised across the project

| Area | Where | Covers |
|---|---|---|
| **Overall product** | [`docs/01-product-vision.md`](../01-product-vision.md), [`docs/06-roadmap.md`](../06-roadmap.md), [`docs/07-future-scope.md`](../07-future-scope.md), [`docs/03-architecture.md`](../03-architecture.md) | What JSMF is as a company/product, the stage sequence, the platform-wide technical direction, and the running backlog. Applies to every JSMF product. |
| **PYQ web application** | [`docs/02-v1-scope.md`](../02-v1-scope.md), [`docs/04-content-pipeline.md`](../04-content-pipeline.md), [`docs/05-ui-ux-plan.md`](../05-ui-ux-plan.md) | The question-bank product specifically — its scope, its content pipeline, and its UI/UX plan. |
| **PDF platform** | this folder | The PDF/digital-content storefront — scope, architecture, data model, admin panel, and API contract. |

## Contents

| Document | Description |
|---|---|
| [01 — V1 Scope](./01-v1-scope.md) | Exactly what the first release of the PDF platform does and deliberately does not do, plus the long-term product surface it is being built toward. |
| [02 — Architecture](./02-architecture.md) | Service layering, the private-storage and signed-URL model, the payment flow, and the specific decisions that keep this loosely coupled and extensible. |
| [03 — Data Model](./03-data-model.md) | Every database table, column, constraint, and index — and the reasoning behind the ones that are not obvious. **This is the document to review first.** |
| [04 — Cascade Deletes](./04-cascade-deletes.md) | A standalone reference listing every `ON DELETE CASCADE` relation in the schema and exactly what disappears when it fires — check this before adding or changing any delete behavior. |
| [05 — Storage](./05-storage.md) | The storage port, the four-bucket topology, the credential model (no key files anywhere, and why), and the provider-migration procedure with its current status. |

Start with [01 — V1 Scope](./01-v1-scope.md) for what is being built, then [03 — Data Model](./03-data-model.md), which is where the extensibility commitments actually live.
