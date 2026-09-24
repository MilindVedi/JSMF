# PDF Platform — Architecture

This document covers how the PDF platform is built. It sits underneath the platform-wide direction in [`docs/03-architecture.md`](../03-architecture.md) (NestJS + PostgreSQL + object storage, modular monolith — Redis is in the long-term stack but [deliberately switched off in V1](../03-architecture.md#redis-is-off-in-v1-on-purpose)) and does not contradict it — this is that direction, made concrete for the first product that actually needs a backend.

## Repository layout

```
JSMF/
  docs/                      Product, architecture, planning
  web/                       Next.js app — the PYQ mock UI            (port 3000)
  pdf-web/                   Next.js app — PDF storefront + admin     (port 3001)
  backend/                   NestJS API  ← created for this product   (port 4000)
  mobile/                    (not yet created) Flutter
```

The PDF storefront and admin panel are **their own Next.js project**, `pdf-web/`, not route groups inside `web/`. They were built inside `web/` first and then split out, for the same reason the backend and the docs are separate: this is a different product on a different release timeline — it ships *first*, while `web/` is still a mock over hardcoded data. Independent projects mean independent deploys, and a change to the mock cannot break the product that is actually live.

The two share an identity provider (the same backend, the same JWKS) and the JSMF brand, but no build-time coupling. `components/ui/` is duplicated rather than imported across projects — a deliberate trade while those primitives are stable; the answer when it stops being true is a shared package, not a re-merge.

The backend is a **separate NestJS service**, not Next.js route handlers. This is the one place worth spending extra setup cost, for three reasons:

1. A Flutter mobile client is on the roadmap and needs the same API. Business logic inside Next.js server actions cannot be consumed by Flutter.
2. Payment verification, signed-URL minting, and entitlement checks must live somewhere the browser cannot reach or influence. A dedicated service makes that boundary obvious rather than a convention people have to remember.
3. It matches what [`docs/03-architecture.md`](../03-architecture.md) already commits to, so this product is the first slice of the real architecture rather than a detour that has to be unwound later.

## Layering inside the backend

The loose-coupling requirement is enforced by layering, and the rule is one-directional: **each layer may only import from the layer below it.**

```
  HTTP Controllers        ← thin: parse, validate DTO, call a service, shape the response
        ↓
  Application Services    ← use cases: "publish product", "verify payment", "grant download"
        ↓
  Domain                  ← entities, value objects, business rules. Zero framework imports.
        ↓
  Repositories / Ports    ← interfaces: ProductRepository, StorageProvider, PaymentProvider
        ↓
  Adapters                ← Prisma, Cloudinary, Razorpay — the replaceable parts
```

Two consequences of this that matter for the requirements:

- **The domain layer imports nothing from NestJS, Prisma, Razorpay, or Cloudinary.** It is plain TypeScript. That is what makes the business rules testable without a database and portable if the framework ever changes.
- **Providers sit behind ports.** `PaymentProvider` and `StorageProvider` are interfaces; `RazorpayAdapter` and `CloudinaryAdapter` implement them. Adding Stripe for international payments, or moving from Cloudinary to GCS, is a new adapter and a config change — not a rewrite through the codebase. This is the concrete answer to "loosely coupled".

Modules are bounded by domain, not by technical layer: `catalog`, `taxonomy`, `orders`, `payments`, `entitlements`, `storage`, `identity`, `admin`. Each owns its tables and exposes a service interface; modules call each other through those services, never by reaching into another module's repositories.

## Content model: products, not PDFs

There is no `pdfs` table. The core entity is a **product** with a `type` discriminator (`PDF` today; `VIDEO`, `COURSE`, `BUNDLE` later), and the file lives in a separate `product_assets` table.

This is deliberate and it is the single most important structural decision in the schema. A `pdfs` table would mean that adding video courses later requires a `videos` table, a `courses` table, duplicate order logic, duplicate entitlement logic, and a storefront that has to branch on which table a thing came from. One `products` table means a bundle containing a PDF and a video is just a product whose children are other products, and the order/payment/entitlement/library code never changes at all.

## Categories: taxonomy, not columns

Subject and topic are **not columns on the product table.** They are rows in a generic taxonomy system:

- `taxonomies` — the *kinds* of category that exist (`subject`, `topic`, `exam`, …)
- `taxonomy_terms` — the values within a kind (`Pathology`, `NEET-PG`, …), optionally nested
- `product_taxonomy_terms` — which terms a product carries

The explicit requirement was to be able to add more category types later without rework. With this model, adding "Difficulty", "Year", "Language", or "Doctor" as a new filterable category is an `INSERT` into `taxonomies` — no migration, no deploy, no code change, and the admin form and the storefront filters both render it automatically because they are driven by what is in the taxonomy tables rather than by hardcoded fields.

### Status: built

`backend/src/modules/catalog/` — products, assets and taxonomy, with an admin API and a public storefront API.

The extensibility claim above is now a tested one rather than an intention. A test creates a brand-new taxonomy ("Difficulty") through the API, adds terms, assigns one to a product, and filters the public storefront by it — with no migration, no deploy and no code referring to "difficulty" anywhere. Storefront filtering accepts `?terms=anatomy,neet-pg`: term slugs, ANDed, from any taxonomy including ones that do not exist yet. Filters ANDed rather than ORed because picking Anatomy *and* NEET-PG must narrow the results, not widen them.

Decisions worth recording:

- **Publishing is refused unless a current `PRIMARY_FILE` exists.** A published product is a link in a YouTube description; publishing one with no file attached is a broken promise to everyone who clicks it, and "the admin will remember" is not a mechanism.
- **A published slug cannot be changed.** That URL may already be in a video description that cannot be edited. Changing it is a deliberate act — archive and replace — never a side effect of fixing a typo in the title.
- **Assets are never overwritten or deleted.** A corrected re-upload becomes version n+1; the previous version stays. An upload byte-identical to the current version is refused as a mistake (that is what `checksum_sha256` is for), and an earlier version can be promoted back if a replacement turns out to be the wrong file.
- **`is_multi_select` is enforced at assignment.** A product may carry several subjects but only one difficulty, and which is which is data rather than a rule written into the code.
- **Term deletion is refused while the term is in use.** The foreign key is `RESTRICT` and would refuse anyway; the service turns that into a sentence naming how many products are affected, so the admin untags them deliberately instead of seeing a constraint error.
- **Deleting a term or a product link is a soft delete, restorable via a dedicated endpoint.** Both tables carry `deleted_at`; both have partner `restore` routes (`POST .../terms/:id/restore`, `POST .../links/:id/restore`). Since `taxonomy_terms(taxonomy_id, slug)` uniqueness now has to survive a slug being reused after its original term is soft-deleted, that constraint moved from a plain `UNIQUE` to a **partial unique index** `WHERE deleted_at IS NULL` — the same pattern as `entitlements_user_product_active_unique`. A restore is refused with a clear error, rather than a raw constraint violation, if a newer term has since taken that slug.
- **The storefront never returns a private asset's storage address.** Product pages expose file size, page count and type — never `object_key`. Reaching the file is a separate question answered by the download endpoint.
- **Taxonomy management is ADMIN-only**, while products are ADMIN or EDUCATOR. A taxonomy is shared master data; editing your own PDF is not.
- **Every admin mutation writes an audit row inside the same transaction as the change.** Not after it — atomically with it, so a published product without an audit row, or an audit row for a rolled-back publish, are both impossible.

Uploads are buffered in memory and bounded by `MAX_UPLOAD_SIZE_MB` (default 64). The upload happens before the database transaction opens, since object storage is not transactional and holding a transaction open across a large file transfer would lock rows for its duration; if the transaction then fails, the orphaned object is removed.

Verified end to end against the running API: **69 assertions**, including that the database itself rejects a second current asset for the same (product, kind) — the partial unique index, tested by trying to violate it directly in SQL rather than trusting the application to be the only writer. A further **19 assertions** cover soft delete specifically: a term's slug becomes reusable the moment it is soft-deleted, restoring is refused if a newer term has since taken that slug, a soft-deleted link is still visible to the admin (so it can be restored) but hidden from the public product page, and — checked directly in Postgres — the original row is never actually removed by any of this.

## Storage and download access

**`STORAGE_DRIVER=cloudinary` is active, using the production account (`dxa4fadu`).** `local` was the bootstrapping default while no Cloudinary account existed; it is now available only as an offline-dev fallback (`.storage/` on disk, no volume needed since it is unused). Because every asset row records which provider it was uploaded through (`storageProvider`), switching the active driver never orphans anything already uploaded under `local` — the local adapter stays constructed so those rows keep resolving. **Cloudinary is the V1 provider.** It satisfies the two things this design actually requires of a storage backend — private, non-guessable storage of the original file, and time-limited signed delivery URLs — via `raw` resource uploads with an authenticated delivery type. Cover images additionally benefit from its CDN and on-the-fly transforms, which would otherwise be work we did ourselves.

Two storage postures, regardless of provider:

| Posture | Holds | Why |
|---|---|---|
| Public | Cover images, thumbnails | Marketing assets meant to be seen and CDN-cached. Making these private would cost a signed-URL round trip just to render a listing page. |
| **Private** | The actual PDFs | This is the product. It must never be reachable without an entitlement check. |

### Staying provider-agnostic

The requirement is that moving to GCS, S3, Hugging Face, or anything else later is straightforward — **not** that adapters for those are written now. Three things deliver that, and only the first costs anything today:

1. **Everything goes through a `StorageProvider` port.** Application code calls `upload`, `getSignedDownloadUrl`, and `delete`; it never imports a vendor SDK. A new provider is a new class implementing that interface plus a config value — no caller changes.
2. **The provider is recorded per asset, not assumed globally.** `product_assets.storage_provider` says where each file actually lives. This is what makes a migration incremental: a background job can move files and update rows a batch at a time, with both providers serving live traffic throughout, instead of a flag day where changing one config value makes every existing row's location a lie.
3. **The port's vocabulary is deliberately generic.** `bucket` + `object_key` map onto a GCS/S3 bucket and object, and equally onto a Cloudinary folder and `public_id`. No provider-specific concept leaks into the interface or the schema.

Adapters that exist: `CLOUDINARY` (production) and `LOCAL` (development, no account needed). `GCS` and `S3` are enum values with no implementation — listed to make the point that the provider is data rather than an assumption.

### Status: built

`backend/src/modules/storage/` — the port in `domain/`, both adapters in `infrastructure/`, and `StorageService` in `application/`, which is the only thing other modules inject.

One behaviour is worth calling out because it is what turns point 2 above from an intention into a guarantee. `StorageService` splits reads from writes:

- **Writes** go to the adapter named by `STORAGE_DRIVER`.
- **Reads, deletes and existence checks** go to the adapter named by *the object's own `storage_provider` value*.

So flipping `STORAGE_DRIVER` to `cloudinary` sends new uploads to Cloudinary while every file already on disk keeps being served from disk. Had reads followed the config instead, that same flip would have turned every existing asset into a 404. An object whose provider has no registered adapter raises a 503 naming the provider, rather than failing obscurely.

The local adapter is a real implementation, not a mock: files are written to disk, and `getSignedDownloadUrl` returns a URL to this API's own `GET /api/storage/local/download`, which verifies an HMAC over `bucket + object_key + expiry` before streaming anything. That route is `@Public` by design — the signature *is* the authorisation, exactly as with a cloud provider's signed URL — so the entitlement check cannot quietly come to depend on a session cookie that Cloudinary would never send. Verified: tampering with the signature, the key, or the expiry all fail, as does an expired link.

Two smaller decisions that are load-bearing:

- **The uploader never controls the object key.** It is `<caller prefix>/<uuid><ext>`; the user's filename is stored as metadata only. A filename cannot steer where bytes land, and two uploads of `notes.pdf` cannot collide.
- **The download filename is sanitised before it reaches a header.** It is reflected into `Content-Disposition`, so quotes, backslashes and CR/LF are stripped — otherwise it is a response-header injection.

Cloudinary specifics: private objects are `raw` + `authenticated` (no public delivery URL exists at all, and a PDF comes back byte-identical rather than being treated as a transformable image), with downloads minted through `private_download_url`, which carries a genuine expiry and needs no token-auth add-on. Cover images are ordinary `image` uploads so transformations stay available.

#### Verified against a live Cloudinary account

**21 assertions**, run against a real cloud with real PDFs. The parts that actually had to be proven rather than assumed:

- A real PDF uploads, and Cloudinary's own Admin API confirms it stored as `resource_type=raw`, `type=authenticated`, with a matching byte count.
- The signed URL returns the file **byte-identical** to what was uploaded.
- **The security model holds.** The plain delivery URL for the same object, without a signature, returns **401**. Guessing `type=upload` instead returns **404**. Extending `expires_at` in a signed URL breaks the signature and returns **401**. This was the real question — if a private PDF had turned out to be reachable by path alone, Cloudinary would have been the wrong choice for paid content.
- A public cover image loads over an unsigned CDN URL, as intended.

**Stored objects relax `Cross-Origin-Resource-Policy`.** helmet sets `same-origin` globally, which is correct for the JSON API but prevented the browser from rendering any stored object in an `<img>`, because the API and the web apps are on different origins in every environment. The local-storage download route therefore sets `Cross-Origin-Resource-Policy: cross-origin` for stored objects only. Access to them is governed by the expiring signature in the URL, not by the requesting origin, so this gives nothing away. Without it, cover images silently failed to render under `STORAGE_DRIVER=local` — the request succeeded and the browser discarded the response.


#### The blocker this surfaced: a hard 10 MiB ceiling

Cloudinary's **free plan rejects any raw upload above 10,485,760 bytes** — confirmed exactly: a file at precisely 10,485,760 succeeds, one byte more fails with `File size too large. Got 10485832. Maximum is 10485760.`

This matters because a scanned PYQ compilation can easily exceed 10 MB, so it is a real product constraint and not a theoretical one. The options are a paid Cloudinary plan (which raises the raw limit substantially), compressing PDFs before upload, or — since storage is behind a port — pointing `STORAGE_DRIVER` at a provider without that ceiling. That last option costing one new adapter and no caller changes is precisely why the port exists.

`MAX_UPLOAD_SIZE_MB` now defaults to 10 (was 64) so that an oversized file is rejected immediately with a clear message, rather than uploading fully and only then failing at Cloudinary.

#### A bug this found

Cloudinary reports failures as plain objects (`{ message, http_code }`), not `Error` instances — so the adapter's original `String(error)` produced `"[object Object]"` and every upload failure reached the admin as a bare **500 with the reason destroyed**. That is exactly how the size limit first appeared, and it would have been equally opaque for a disabled-PDF-delivery account or a quota exhaustion. Failures are now translated: **413** for size/format rejections, **503** for auth failures (with a message pointing at Settings → Security, since a Cloudinary account with *PDF and ZIP files delivery* disabled produces precisely that), and the SDK timeout is raised to 120s so a large file on a slow uplink does not fail as an opaque timeout that merely looks like a size limit.

New environment variable: `APP_PUBLIC_URL` (default `http://localhost:4000/api`). Signed local links are handed to browsers, so the base URL cannot be inferred from an inbound `Host` header without trusting it.

The download path, every time, with no exceptions for free content:

```
Browser → GET /api/products/{id}/download
              ↓
         Is the product free?  ─ yes ─→ allowed
              ↓ no
         Is the user authenticated?  ─ no ─→ 401
              ↓ yes
         Does an ACTIVE entitlement exist for (user, product)?  ─ no ─→ 403
              ↓ yes
         Mint a short-lived signed URL, expiry ~5 minutes
              ↓
         Log the access (user, product, asset, ip, expiry)
              ↓
         302 redirect to the signed URL
```

Free PDFs go through the same code path rather than being handed a public URL, so that "free" stays a pricing decision rather than a storage decision — a PDF can be made paid later without moving the file or breaking links.

Signed URLs are short-lived and single-purpose. A shared link stops working within minutes, and the access log makes systematic sharing visible.

## Payment flow

The governing principle: **the browser is never trusted with an amount, and the webhook is the source of truth.**

```
1. Browser  → POST /api/orders            { productId }
2. Backend  : price is read FROM THE DATABASE, never from the request
              creates order (status CREATED)
              creates a Razorpay order
              returns { orderId, razorpayOrderId, amount, key }
3. Browser  : opens Razorpay checkout
4. User     : pays
5. Browser  → POST /api/payments/verify    { razorpay_order_id, payment_id, signature }
              Backend verifies the HMAC signature → optimistic UI unlock
6. Razorpay → POST /api/webhooks/razorpay  (payment.captured)
              Backend verifies the webhook signature
              Records the event by its provider event id  ← idempotency guard
              Marks the order PAID, grants the entitlement
```

Steps 5 and 6 both lead to the same outcome, and both are written to be idempotent, because either one can arrive first, twice, or not at all:

- If the user closes the tab after paying, step 5 never happens — the webhook still grants access.
- If Razorpay retries the webhook (it does), the unique constraint on the provider event id means the second delivery is recorded and ignored rather than granting a second entitlement.
- A partial unique index guarantees at most one `ACTIVE` entitlement per (user, product) at the database level, so correctness does not depend on application code remembering to check first.
- If the webhook never arrives at all — the endpoint was redeploying, the secret was wrong, the network dropped it — and the tab was closed too, a **reconciliation sweep** asks Razorpay what actually happened and settles it. That is step 7, and it is what makes "no payment is lost" true rather than merely intended; without it, the two paths above are both optional and the failure is silent.

### Status: built — and verified against live Razorpay

`backend/src/modules/orders/` (ordering, payment settlement, webhook) and `backend/src/modules/entitlements/` (access control, downloads, library). The split is deliberate: an order is *one way to acquire* access, not the definition of it — admin grants, free claims and future subscriptions all write entitlements with no order behind them, so the module answering "may this person download this" must not depend on the module that sells things.

Endpoints:

| Endpoint | Auth | Purpose |
|---|---|---|
| `POST /api/orders` | bearer | Start a checkout. Returns `kind=FREE` (already settled) or `kind=PAYMENT_REQUIRED` |
| `POST /api/payments/verify` | bearer | Browser callback — unlocks the UI promptly |
| `POST /api/webhooks/razorpay` | signature | The authority for granting access |
| `GET /api/orders`, `/api/orders/:id` | bearer | Order history |
| `GET /api/me/purchases` | bearer | The buyer's library |
| `GET /api/products/:id/download` | optional | Signed URL, entitlement-gated |

The decisions that matter:

- **The price is read from the database; there is no amount field in the request.** The classic "edit the price in devtools" attack has nothing to attach to, because the client is never asked for a number. The invoice email likewise comes from the authenticated account, not the body.
- **The webhook is the authority; the browser callback is a convenience.** A user who closes the tab after paying never sends the callback, so access cannot depend on it. Both paths converge on one idempotent `settle()`, since either may arrive first, twice, or never.
- **A valid signature proves the payment is genuine, not that the caller is the buyer.** The verify endpoint additionally checks the order belongs to the caller — without it, anyone holding a signature could settle someone else's order.
- **Invalid webhooks are never written to `payment_webhook_events`.** That table's `provider_event_id` is `UNIQUE` and is the entire idempotency mechanism; storing unverified events would let anyone POST a forged event id and have the genuine Razorpay delivery dropped later as a duplicate — turning the idempotency guard into a way to deny someone what they paid for. Verified-but-failed processing *is* stored, marked `FAILED` with the reason, so it is replayable rather than lost.
- **A duplicate webhook returns 200.** Providers retry until they get a success; answering anything else for an event already handled just invites the same delivery again. The endpoint is also exempt from rate limiting — throttling it would throttle our own revenue, and the HMAC already makes unauthenticated flooding pointless.
- **The settled amount is checked against what we recorded at order creation**, never taken from the callback.
- **A free product still produces a real order** (total 0, satisfying the same `total = subtotal − discount + tax` CHECK). Granting an entitlement with no order would split "what this person acquired" across two shapes and leave a hole in the history if the product were later made paid.
- **Order numbers come from a Postgres sequence** (`JSMF-2026-000001`), not `max() + 1`, which is a race two simultaneous checkouts would lose. Gaps are fine; this is an identifier to read aloud in support, not a count.
- **`JwtAuthGuard` now attaches the user on `@Public()` routes when a valid token is present**, without enforcing it. That is what lets one download endpoint serve an anonymous visitor taking a free PDF and a signed-in buyer taking a paid one, with the entitlement check — not the route — deciding.
- **An unpublished or archived product stays downloadable for someone who already owns it.** Withdrawing something from sale is not the same as taking it from the people who bought it.

#### Closing the three ways a payment could still be lost

The two settle paths above are both best-effort deliveries over a network. An audit found three places where both could fail and nothing would notice, each of which has since been closed:

- **Nothing asked the provider.** `PaymentService.reconcile()` sweeps payments still sitting in `CREATED`/`AUTHORIZED` after a grace period, asks Razorpay for the payments made against that order, and settles any capture it finds. `PaymentReconciliationService` runs it every five minutes in-process — V1 has one API container, and a cron that costs nothing to host is the right size for a job making a handful of HTTP calls. It only ever *adds* a settlement the provider says is owed; it never marks anything failed, because an order with no payment attempt is the ordinary case of someone changing their mind. The lower bound on age (`PAYMENT_RECONCILIATION_GIVE_UP_AFTER_HOURS`) exists so the sweep does not re-query every checkout ever abandoned, every five minutes, forever. `PAYMENT_RECONCILIATION_ENABLED` turns it off for the day a dedicated worker or a second API instance takes it over — duplicate sweeps are harmless because `settle` is idempotent, but they are wasted provider calls.
- **Checkout could orphan a provider order.** The order row is written, Razorpay is called, and *then* the `payments` row carrying the provider's order id is written. A crash in that last gap left a provider order the buyer could still pay with nothing locally to join it back to — and `settle` looks up by exactly that id, so the webhook would fail permanently. It is now recoverable rather than fatal: `createOrder` writes our own order id into Razorpay's `notes`, so `ensurePaymentRecord` fetches the provider order, reads `jsmf_order_id` back out and rebuilds the row. The rebuild locks the order row first, because `provider_order_id` is indexed but not unique and two settlements arriving together would otherwise both insert.
- **The two settle paths racing produced an error.** `EntitlementService.grant` relied on catching the unique violation and recovering with a query. In Postgres a raised constraint error **aborts the whole transaction**, so the recovery query failed too and rolled back a settlement that had in fact just succeeded on the other path — turning the very race the method exists to tolerate into a 500 for whoever arrived second. It now absorbs the conflict with `ON CONFLICT DO NOTHING` (`skipDuplicates`), which never raises, at the cost of one extra `SELECT` per grant.

A fourth gap was configuration rather than code: `RAZORPAY_WEBHOOK_SECRET` held a placeholder, which passes every check the application makes and then rejects every real webhook as unsigned — the only symptom a log warning. Boot now refuses a Razorpay credential that still looks like a placeholder, so this fails loudly at startup instead of quietly at the first payment.

**A schema change worth making but not yet made:** `payments.provider_order_id` is indexed, not `UNIQUE`, although exactly one payments row should ever exist per provider order. The lock above makes the rebuild correct without it, but the constraint would make it correct by construction. Flagged for review rather than applied.

Verified: **42 assertions** on the stub driver, plus **12 against the live Razorpay test API**. The live run created a genuine Razorpay order, then queried Razorpay's API independently to confirm it existed there with the right amount, our order number as its receipt, and our internal order id in its notes; a real `orderId|paymentId` HMAC was accepted and a one-character change rejected. Checked directly in Postgres afterwards: the redelivered webhook produced **zero** duplicate entitlements, and the forged and amount-tampered webhooks were never stored at all.

`backend/src/modules/orders/application/payment.integration.spec.ts` covers the settlement path against a real Postgres — capture, redelivery, amount mismatch, the orphaned-payments-row rebuild, the two settle paths racing, and all three reconciliation outcomes (settles a lost capture, leaves an abandoned checkout alone, ignores one too old to matter). It wires the services by hand rather than through the Nest container, because `emitDecoratorMetadata` is a TypeScript compiler feature Vitest's esbuild transform does not implement. Both the rebuild test and the race test were confirmed to fail against the pre-fix code, so they test the fix rather than merely accompanying it.

**One manual step before going live:** `RAZORPAY_WEBHOOK_SECRET` is still a placeholder, and `PAYMENT_DRIVER` is still `stub`. Create a webhook in the Razorpay dashboard (Settings → Webhooks) pointing at `POST /api/webhooks/razorpay`, subscribe to `payment.captured` and `payment.failed`, and put the secret it generates into `.env` — it is not the API key secret. Razorpay must be able to reach the endpoint, so testing locally needs a tunnel (`cloudflared tunnel --url http://localhost:4000`). Boot refuses the placeholder once `PAYMENT_DRIVER=razorpay`, so this cannot be forgotten silently.

### Status: built

`backend/src/modules/payments/` — the `PaymentProvider` port plus `RAZORPAY` and `STUB` adapters. The port covers order creation, checkout-signature verification, webhook verification, payment lookup and refunds. The orders/checkout *flow* described above is not built yet; these are the pieces it will be assembled from.

**Webhook verification returns a discriminated union**, not `{ valid, event }`:

```ts
type WebhookVerification =
  | { signatureValid: true;  event: PaymentWebhookEvent }
  | { signatureValid: false; reason: string }
```

The event is unreachable on the invalid branch, so no caller can read a webhook's contents without having proved it authentic. The shape with a boolean flag compiles just as happily when the check is forgotten; this one does not.

**Only signature-valid webhooks may be written to `payment_webhook_events`.** That table's `provider_event_id` is `UNIQUE`, and that constraint is the entire idempotency mechanism. Recording unverified deliveries "for forensics" would let anyone POST a fabricated event id and have the genuine Razorpay delivery dropped later as a duplicate — turning the idempotency guard into a way to deny people what they paid for. Invalid deliveries are logged and rejected, never stored.

**The stub mirrors Razorpay's mechanics, not just its outcomes** — the same `orderId|paymentId` HMAC, the same HMAC-over-raw-body for webhooks, the same header names, the same event vocabulary. `simulateWebhook()` produces correctly signed raw bytes plus headers, so the webhook endpoint can be driven through its real verification and idempotency logic instead of a test-only shortcut. A stub that just returned `true` would mean the hard parts first ran against real money. It can also reissue a given event id on demand, which is how redelivery gets tested.

Razorpay is implemented directly over its REST API rather than through the SDK: the surface actually used is three endpoints plus an HMAC, the security-critical half is `crypto.createHmac` either way, and a wrapper around `fetch` is a dependency whose release cadence becomes ours. **It has not been exercised against a live Razorpay account** — that needs your keys. What is verified is that its signature construction matches Razorpay's documented `orderId|paymentId` HMAC, checked against an independently computed value.

Money crosses to Razorpay as a JSON number of paise, the one place a `BigInt` must become a `Number`; that conversion is range-checked rather than assumed.

Verified end to end against the running app: **41 assertions**, covering signed-URL forgery and expiry, path traversal, header injection, provider fallback, checkout-signature binding, webhook tampering, redelivery, and the refund lifecycle.

## Frontend structure

The PDF platform has **its own Next.js project**, `pdf-web/`, separate from `web/` (the PYQ question-bank application):

```
pdf-web/src/app/            port 3001
  (store)/                  public storefront
      pdfs/                   browse, filtered from the taxonomy tables
      p/[slug]/               the shareable PDF page
      library/                My Library
      account/                buyer login + signup
  (admin)/                  admin panel, role-gated
      products/               list, create, edit, upload, publish
      taxonomy/               manage categories and terms
      orders/                 order management

web/src/app/                port 3000 — unchanged, still the PYQ mock
  (marketing)/ (app)/ (auth)/
```

**Why separate rather than route groups in one app.** This was initially built as `(store)` and `(admin)` groups inside `web/`, and then split out. The separation matches the one already drawn for the backend and the docs: the PDF platform is a different product with a different release timeline — it ships *first*, while `web/` is still a mock over hardcoded data. Two projects means each deploys on its own schedule, and a change to the PYQ mock cannot break the product that is actually live. The cost is that `components/ui/` is duplicated rather than imported; that is an acceptable trade while the primitives are stable, and the moment it stops being true the answer is a shared package, not a re-merge.

They share an identity provider (the same backend, the same JWKS) but no build-time coupling whatsoever.

The admin panel is a route group within `pdf-web/`, gated by role on the client and calling admin-only API endpoints that re-check the role server-side. Client-side route gating is treated as a UX convenience, never as the security boundary.

The split surfaced one real gap immediately: the backend's `CORS_ORIGINS` allowed only `http://localhost:3000`, so the new project on 3001 was blocked outright. Both ports are now listed.

### Status: built — the admin panel

`pdf-web/src/app/(admin)/admin/` with supporting pieces in `pdf-web/src/lib/api/`, `pdf-web/src/store/session-store.ts` and `pdf-web/src/components/admin/`. Routes: `/admin/login`, `/admin/products`, `/admin/products/new`, `/admin/products/[id]`, `/admin/taxonomy`, `/admin/orders`.

This is the **first part of the frontend that talks to the real backend** — everything else under `web/` is still the PYQ mock over hardcoded data. The two are deliberately not merged: `session-store.ts` (real) is separate from `auth-store.ts` (mock), because a mock login must never be able to put the app into a state the real backend never issued.

Decisions worth recording:

- **The access token lives in memory only; the refresh token is in `localStorage`.** An access token in `localStorage` would be a valid credential readable by any script for its whole lifetime. In memory it dies with the tab, and the refresh token is what survives a reload. That refresh token is single-use and rotates, so a stolen one is detectable rather than merely secret — which is the trade that makes this acceptable for a deliberately cookie-free API (the same endpoints will serve the Flutter app).
- **Exactly one code path may exchange a refresh token.** See the bug below; this is not a stylistic preference.
- **The upload size limit is stated before the upload, not discovered after it.** The file input shows "PDF only · maximum 10 MB. Larger scans should be compressed or split before uploading," and rejects an oversized file in the browser in a second rather than after a long transfer. The server enforces the same limit independently — the client check is courtesy, not control.
- **Nothing in the product editor is written until Save is pressed, and leaving a step with pending edits asks first.** All four steps — Details, Files, Categories, Links — expose the same `StepSectionHandle` (`isDirty` / `save()` / `discard()`), so the page drives them identically without knowing what any of them holds; Files composes the two upload controls behind one handle. Save lives in the step navigation beside Back and Next rather than on each form, so "finish this step, then move on" reads as one row. Leaving a dirty step raises a dialog naming the step, and only discards once it is accepted. The alternative — uploading on file-select, as this previously did — meant choosing a cover and disliking it had already replaced the live one, which is a change to undo rather than one to abandon.
- **Every route out of a dirty editor asks the same question, in the app's own dialog.** `pdf-web/src/components/admin/unsaved-changes.tsx` owns the decision; the step navigation, the tab strip, the page's "Products" link and the browser's own Back button all funnel through its `guardLeave()`, which resolves a promise so callers read `if (await guardLeave()) …`. It renders a Base UI alert dialog (`components/ui/alert-dialog.tsx`) rather than `window.confirm`, which cannot be styled and makes a moment that matters look like it belongs to a different application. Browser Back is not a click that can be intercepted, so it is caught after the fact: an extra history entry for the same URL sits above the editor, Back consumes that instead of navigating, and `popstate` fires with the page still on screen — the moment to ask. Answering "Discard them" walks back past both entries; "Keep editing" re-arms the sentinel. Two details are load-bearing and were both found by browser testing: a `history.go()` called synchronously inside a `popstate` handler is discarded by the browser and must be deferred a task, and the sentinel push must be idempotent because Strict Mode runs the effect twice, which would otherwise leave an unaccounted-for entry and land every later "discard" back on the editor. Reload and tab-close fall back to the browser's own generic `beforeunload` prompt, which is the only thing allowed there.
- **Every action has a visible affordance.** Three separate reports traced back to the same mistake: something *was* clickable, but nothing said so. The products list navigated only from the title text inside a row styled `cursor-pointer`; the upload zone accepted a click only on the word "browse"; the tab strip grew a native scrollbar whose arrows looked like buttons. The rule now applied is that the whole target is clickable and the action is named — the products list has an explicit **Edit** action and a fully clickable row, the upload zone is a single `role="button"` region, and the tabs carry Back / Next step navigation at the foot of each panel.
- **The product editor shows what the storefront will show.** The Details and Files steps each render the real `ResourceCard` component with the product's current draft values, under "Storefront preview". It reuses the storefront component rather than reproducing it, because a preview that has drifted from the thing it previews is worse than none. The current cover is shown as a thumbnail rather than a filename, since a wrong image is only recognisable by looking at it. The Links step additionally renders the real `LinksSection` — "Watch the accompanying lesson" and the related-links list — exactly as the product page shows it.
- **Cover images use `object-contain`, not `object-cover`.** `cover` fills the card's fixed box by cropping into whatever doesn't fit, which silently cuts off part of an image the admin never asked to have cropped. `contain` always shows the whole upload, letterboxed on `bg-muted` when its aspect ratio doesn't match the box. Applies wherever `ResourceCard` is used — the landing page, Browse, and the admin's own storefront preview — plus the product page's purchase card, so what an admin sees while editing is the same full image a buyer sees.
- **The product page shows the cover too, at the top of the purchase card.** It previously did not, which meant the cover appeared on a Browse card and then vanished the moment the buyer clicked through — backwards, since the product page is where the decision to buy is actually made. The gap was in the API rather than the page: `findPublic` (the listing query) selects the cover's storage address and `CatalogController` maps it to a `coverUrl`, but `findPublicBySlug` deliberately omits `storageProvider`/`bucket`/`objectKey` from its `assets` select, because that select spans every asset kind and widening it would have handed the browser the `PRIMARY_FILE`'s address — the one thing the storefront must never return. The cover is therefore fetched as its own query, restricted to `COVER_IMAGE` (the only public-bucket kind), and the detail endpoint maps it to `coverUrl` exactly as the listing does. The page renders the image only when there is one: an empty placeholder box would be a larger and more prominent nothing than simply omitting it, since this card stands alone rather than needing to line up with a grid of siblings.
- **`ResourceCard` — the grid card shared by the landing page and Browse — carries a small "▶ Video" badge over the cover whenever the product has a YouTube link.** Most visitors arrive at a product *from* a video, so a badge that a companion lesson exists is one of the strongest signals the card can carry, right after the title. `findPublic` (the storefront listing query) includes only the `id` of any `YOUTUBE`-kind link for this — not the URL or label a full product page needs — so every card on every listing page stays a cheap query rather than pulling in each product's whole link list. The badge is decorative, not a second link nested inside the card's own link: the actual video lives on the product page the card already goes to.
- **Categories render entirely from the taxonomy tables.** Nothing in the product form names "subject" or "topic"; a new category kind added under `/admin/taxonomy` grows a new section on the product form with no code change. A single-select taxonomy replaces its own selection in the UI rather than letting two be ticked and failing the save.
- **The public product page groups its category badges by taxonomy** (`EXAM`, `SUBJECT`, `RESOURCE TYPE`, each as an uppercase label over its own badges) rather than one flat, unlabelled row. `pdf-web/src/components/store/term-groups.tsx` derives the grouping client-side from `term.taxonomy` on each assignment — every term already carries it — so this needed no API change. `TaxonomyTerm` also supports nesting a term under another (`parentTermId`, deliberately allowed to cross taxonomies — that is how a `Topic` term's parent can be a `Subject` term without a bespoke table), enforced with a cycle check on the backend; the admin Categories UI does not yet expose a parent picker, so nesting is reachable via the API today but not by clicking around `/admin/taxonomy`.

#### The bug the browser test caught

Everything worked until a full page navigation, then the session died with a 401. The cause: React Strict Mode double-invokes effects in development, so session restore ran twice concurrently and sent the *same* single-use refresh token twice. The backend correctly read the second as a replay and revoked the entire token family — exactly the reuse detection the identity module was built to do.

The API client already deduplicated refreshes behind a single in-flight promise, but `restore()` bypassed it by calling `/auth/refresh` with its own `fetch`. The fix routes every caller through one exported `ensureRefreshed()` and additionally guards `restore()` with its own in-flight promise. **This would have logged real users out on virtually every page load**, and no amount of API-level testing would have found it — it only appears when a browser mounts two components at once.

#### `ready` must survive a failed refresh

A second failure mode in the same method. `restore()` set `ready: true` on every path it *expected* — no stored token, a refresh the server declined, a failing `/auth/me` — but had no handler for the refresh **throwing** rather than answering. A thrown `fetch` is a different thing from an HTTP error: the API unreachable, a CORS rejection, the dev server mid-restart. On that path `ready` stayed false forever.

That is worse than it sounds, because `ready` does not mean "signed in" — it means "we have finished finding out", and every gated surface waits on it: the library page, the product page's Buy button, and the entire sign-in area of the storefront header. So a momentary network blip left the app loading forever, with no error, no retry, and no way back except a manual reload — and nothing even reported it, since each call site discards the promise with `void restore()`.

`restore()` now wraps the whole body and treats a thrown refresh as signed-out, which is recoverable: the refresh token is deliberately **left in storage**, so the next load signs the user straight back in. Only the in-memory access token is cleared. The rule the method now follows is that `ready` becomes true on every path out, including the unexpected ones.

#### Google sign-in dropped `next`

"Sign in to buy" sends the buyer to `/account/login?next=/p/<slug>`, and the password path already honours that — `destinationFor()` reads `next` and lands back on the product. The Google button did not: `googleAuth.start()` only ever sent the backend a fixed `redirect` (this app's `/auth/callback`), and `/auth/callback` always landed on `/library` or `/admin/products`. Signing in with Google to buy something dropped the buyer onto their library instead, with no purchase started and no obvious way back except clicking through to the product again.

`next` can't simply ride along on `redirect` — the backend checks that value against `OAUTH_ALLOWED_REDIRECTS` with an **exact match on purpose** (`oauth.service.ts`), specifically so a modified query string is rejected as a possible open redirect rather than quietly accepted. So it travels by a separate channel: the login page stashes it in `sessionStorage` immediately before the full-page navigation to Google, and `/auth/callback` reads and clears it once the exchange succeeds. `sessionStorage` survives that round trip without needing the URL to carry it, and disappears with the tab if sign-in is abandoned partway. The admin invitation and admin-login Google buttons pass no `next` and are unaffected — the field is optional and only the storefront's buy-flow login supplies it.

#### The stub driver had no browser-facing checkout

`useCheckout` always loaded the real `checkout.razorpay.com` widget, regardless of driver — `PaymentsModule`'s own comment said a dev-only route for this "can" exist, but none had been built. Under `PAYMENT_DRIVER=stub` that widget is handed `stub_key_id` and a `order_stub_…` id, neither of which Razorpay's servers have ever heard of, so the browser widget failed the instant it opened — before any card was entered. This was not a regression from the sign-in fix above; the stub driver never had a working browser checkout, only a webhook path exercised directly in the integration suite.

The fix keeps the split the backend already draws between "the stub simulates the *mechanics*" and "the stub simulates the *outcome*": `OrderController#simulatePayment` (`POST /orders/:id/simulate-payment`) produces the same HMAC signature the real widget's `handler` callback would hand the browser — `StubPaymentAdapter.signCheckout`, the identical method the integration suite calls — and then drives it through the ordinary `verifyCheckout`, the exact path a real payment takes. Nothing about settlement is shortcut; only the part that has no local stand-in, the actual third-party widget, is skipped. The endpoint 404s outright unless the stub driver is active, so it does not exist as a surface once a real provider is configured. `useCheckout` recognises `checkoutKeyId === "stub_key_id"` — the one value `StubPaymentAdapter.createOrder` ever returns — and calls this instead of loading the widget.

#### "Sign in to buy" didn't resume the buy

Signing in from a product page returned the buyer to that product page — correctly — but left them looking at the same "Buy now" button they had already clicked once. The fix threads a `?buy=1` marker through the same `next` value already carried through login (both the password path and, after the Google fix above, the OAuth path): the product page recognises it, waits until ownership is actually known (not just "signed in" — someone who bought this on another device must not be charged twice), fires `buy()` once, and strips the marker from the URL immediately so a refresh or Back doesn't reopen checkout on its own.

Verified in a real browser (Playwright, Chromium): **22 assertions**, covering wrong-password rejection, product creation, the publish-blocked-without-a-PDF guard, uploading the real PDF, an 11 MB file being refused client-side, category assignment, link creation, publishing, session survival across a reload, logout, redirect-when-signed-out, and no horizontal overflow at 390px.

### Status: built — the storefront as a credibility surface

The storefront was restructured around a problem the original had: with one or
two resources, a catalogue-first homepage advertises an empty shop. Nineteen
subject filters over two resources, ending in "Nothing here yet", says *we have
a huge library and none of it is for you*. The fix is to lead with the educator
rather than the inventory.

| Route | Was | Now |
|---|---|---|
| `/` | redirect to `/pdfs` | landing page — headline, Dr. Angad Rai, featured resources, YouTube/Instagram |
| `/browse` | `/pdfs` | the catalogue, with filters that reflect what exists |
| `/p/{slug}` | unchanged | the permanent shareable link a YouTube description points at |
| `/library` | unchanged | now hidden from the nav entirely when signed out |

**Filters are derived from what is published.** `TaxonomyService.listWithTermsInUse()`
returns only terms with at least one published, non-archived product, drops any
taxonomy left empty, and carries each term's count. Verified against the running
API: 28 terms exist in the database, the storefront offers 3 — `NEET-PG (1)`,
`FMGE (1)`, `Pathology (1)` — and the unused "Resource Type" taxonomy does not
appear at all. The admin panel deliberately still calls `listWithTerms()`,
because an editor assigning categories must see every option including unused
ones. The same UI grows by itself as the catalogue fills; nothing changes when
the twentieth subject gains its first resource.

**The landing page omits the featured strip entirely when nothing is published**,
rather than rendering an empty state on the first screen a visitor sees.

**Author details live in one file** (`pdf-web/src/lib/site-content.ts`) so a
credential or social link is one edit. Two deliberate restraints there: there is
no photograph in the repository yet, so `DoctorPortrait` falls back to an
initials block rather than a stock photo — an obvious placeholder is honest on a
page whose job is proving a real person is behind this, and a stock doctor is
not. And the pull quote is attributed to "The JSMF team", which is how it is
attributed in `web/`; no quote in Dr. Rai's own voice exists anywhere in the
project, and inventing words for a named real person is not a gap to fill by
guessing.

Verified in a browser at 1200px and 390px: all three pages render, the nav hides
My Library when signed out, and horizontal overflow is 0 — which caught a
pre-existing header bug where the full wordmark plus both auth buttons pushed
22px past the viewport on every storefront page.

### Status: built — admin order management and refunds

`backend/src/modules/orders/http/admin-order.controller.ts` (`ADMIN` role only — unlike catalog management, `EDUCATOR` does not get this): `GET /admin/orders` (every customer, filterable by status and by order number/email, paginated), `GET /admin/orders/:id`, and `POST /admin/orders/:id/refund`.

`PaymentService.refund()` is a full refund of the order's captured payment: it calls the provider's `refund()` port method first (never mutating anything locally until the provider confirms), then in one transaction records a `Refund` row attributed to the admin who issued it, marks the `Payment` and `Order` `REFUNDED`, and calls `EntitlementService.revokeForOrder()` so a refund can never leave someone with both their money back and the content. A free order (₹0) skips the provider call entirely — there is nothing to return — and only revokes the entitlement.

The admin Orders page (`pdf-web/src/app/(admin)/admin/orders/page.tsx`) now shows every customer's orders with a status filter, a search box (order number or email), and a Refund button on any `PAID` order, which confirms the amount and customer before calling the API.

Not yet done: this has been typechecked but not run against a live Razorpay refund, and there is no partial-refund support (a refund is always for the full captured amount).

### Status: built — the public storefront

`pdf-web/src/app/(store)/`: `/pdfs` (browse), `/p/[slug]` (the shareable product page), `/library`, and `/account/login` + `/account/signup` for buyers. Checkout lives in `pdf-web/src/lib/use-checkout.ts`.

- **`/p/{slug}` is the link that goes in a YouTube description**, which is why the slug is immutable once published. The page works signed-out and shows the price, page count and file size before asking for anything.
- **Browsing and free downloads never require an account.** A free PDF is fetched anonymously through the same entitlement-checked endpoint as a paid one — verified by a signed-out browser actually receiving the file.
- **Filters render from the taxonomy tables.** The browse page had no knowledge of "Subject" or "Exam"; it drew every filter from `/catalog/taxonomies`, so a category created in the admin panel becomes a storefront filter with no deploy.
- **The amount is never sent from the browser.** `POST /orders` takes only a product id; the widget is handed back an amount the server derived from the product row.
- **A failed verify call does not claim the payment failed.** The webhook is the authority and may still settle the order, so the message says the payment may have gone through and points at My Library — telling a buyer their payment failed when the money has left their account is the worse error.
- **Ownership flips the product page from Buy to Download**, with an "In your library" marker, and a second purchase of the same product is refused with 409.

Verified in a real browser against **live Razorpay test keys**: **23 assertions**. The genuine Razorpay checkout widget opened, correctly showing ₹199, the Test Mode banner, JSMF branding and the buyer's prefilled email. Also covered: anonymous free download delivering a real file, signup returning to the product being bought, the purchase appearing in the library, downloading the purchased PDF, and no horizontal overflow at 390px.

A real card was deliberately not automated. Settlement is proven separately — the test verified a payment using a genuine Razorpay-format HMAC signature and confirmed the UI flipped to owned.

## Storefront visual design

The public storefront follows a design produced in Lovable (kept in
`pdf-web-design/` as the reference; it is a standalone TanStack Router + Vite
project and is not built or deployed). It was adapted into the existing Next.js
app rather than swapped in: the reference renders hardcoded sample resources and
a form that fakes its submit with a `setTimeout`, so only its presentation layer
carried over.

**The design system.** A violet identity (all colors oklch around hue 294),
Sora for display and Manrope for text, `--radius: 0.75rem`. Ported into
`globals.css` as tokens plus the design's own `@utility` primitives —
`eyebrow`, `filter-chip`, `field`, `auth-card`, `doctor-placeholder` and the
rest — so the storefront pages are mostly composition over named primitives
rather than long class strings.

**What was changed rather than copied:**

- **`--brand-deep` was split into two tokens.** The reference uses one token for
  both the deep violet band behind the quote *and* the color of every headline.
  That only works because its dark theme was never finished — as a single token,
  every heading renders dark-on-dark in dark mode. `--brand-deep` is now a
  surface (dark in both themes) and `--brand-ink` is the headline text role
  (inverts for dark). The dark palette itself was written here too: the
  reference's is stock shadcn slate, with a light-grey `--primary` and no brand
  tokens at all.
- **Buttons are storefront-scoped** (`components/store/store-button.tsx`). The
  design's button is a `rounded-full` pill with `min-h-11`; the admin panel is
  built around `components/ui/button.tsx` at `h-8`, and its tables, toolbars and
  row actions are spaced for that. Raising every button in the app would
  re-space screens the design never covered, so the two coexist.
- **The Google button keeps its official styling.** The reference draws it as an
  ordinary secondary button; Google's Sign-In branding guidelines govern that
  mark, and a restyled approximation is the one place where matching an external
  convention beats matching our own. It takes the design's pill shape (which the
  guidelines permit) and nothing else.
- **Covers stay `object-contain`.** The design specifies `object-cover`, which
  crops whatever does not fit a 4:3 box — see the cover-image note under Frontend
  structure for why that is not acceptable here.
- **Real data replaces the reference's fixtures.** Card metadata comes from the
  product's actual taxonomy terms (first two, in admin order) rather than the
  reference's fixed "exam • subject" pair; filter groups and their counts come
  from `/catalog/taxonomies`; prices come from `formatMoney`, including the
  `FREE` case the reference has no example of.
- **Copy stays in `site-content.ts`.** The reference ships its own headline
  ("Revise what matters. Understand why it matters."); the live headline remains
  whatever `brand.headline` says, since that is a content decision rather than a
  design one. Changing it is a one-line edit there.
- **Dropped:** the browse eyebrow's "· Issue 04", which implies a periodical
  that does not exist.

**Pages the design does not cover** — the product page, My Library, and the
whole admin panel — inherit the new tokens and were checked, not redesigned.
They previously relied on the store layout's container; since the landing hero
now needs `<main>` to be full-bleed so its background band can run edge to edge,
those pages carry their own container instead.

Verified in a real browser: all four designed pages against the reference, both
themes, plus **15 assertions** that the behaviour underneath is unchanged —
filters narrowing results, the clear-filters reset, the no-match empty state,
navigation from a card to a real product page, the password toggle, a real admin
login landing on the admin panel, the signed-in nav showing My Library and
Admin, and no horizontal overflow at 390px.

## Status: built — full-stack Docker

Everything is now containerized: Postgres, Redis, the NestJS API, and `pdf-web`. Root-level `docker-compose.yml` (not `backend/docker-compose.yml`, which still exists separately for the lighter "just the database" workflow used by `npm run start:dev`) brings up all four.

- **`backend/Dockerfile`** — multi-stage: builds with dev dependencies, ships only production ones. `docker-entrypoint.sh` runs `prisma migrate deploy` on every container start before the API boots, so a fresh database is never a manual step — this is idempotent, so restarts are harmless.
- **`pdf-web/Dockerfile`** — multi-stage using `next.config.ts`'s `output: "standalone"`, so the runtime image needs no `node_modules` install, just the traced dependency set Next.js produces. `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_MAX_UPLOAD_MB` are build args, not runtime env vars — they're inlined into the browser bundle at build time, so setting them at container start would do nothing.
- **Uploaded files get their own named volume (`jsmf_storage` on `/app/.storage`).** Under `STORAGE_DRIVER=local` every uploaded PDF and cover is written inside the container. Without a volume those files live only in the container's writable layer, so `docker compose down` would delete all of them while Postgres — which *does* have a volume — survives intact, leaving product rows pointing at assets that no longer exist. The failure is silent and only shows up later as a broken download. Production uses `STORAGE_DRIVER=cloudinary` and is unaffected, but a dev catalogue that quietly breaks after a routine `down` is not acceptable either.
- Inside the compose network, the API's `DATABASE_URL`/`REDIS_URL` are overridden to point at the other containers by service name (`postgres`, `redis`) rather than `localhost`, since `.env`'s values are written for running the API directly on the host.

Verified by actually building both images and running the full stack: the API container applied its own migrations against a brand-new containerized Postgres with zero manual steps, `GET /api/health` returned 200, and the `pdf-web` container served `/pdfs` with a real page title, not an error page. Not yet done: no production compose override (this is a local/single-host setup — real production hosting would separate build and deploy and use a managed Postgres, matching [docs/03-architecture.md](../03-architecture.md#scalability-approach-for-later-stages)).

## What this buys later

Each of the long-term goals maps to an additive change rather than a redesign:

| Long-term goal | What it takes |
|---|---|
| Video courses | New `type` value, new asset kind, a player page. Orders, payments, entitlements, library: unchanged. |
| Bundles | A product whose children are products; buying it grants entitlements for each child. The `source` column on entitlements already distinguishes this. |
| Subscriptions | Entitlements already carry `expires_at`; a subscription is a recurring grant. |
| Coupons | Tables designed; order totals already separate subtotal, discount, and total. |
| Multiple educators | Products already carry an author; add a publisher profile and payout split. |
| Marketplace | The above, plus search and discovery over a catalogue that is already type-agnostic and taxonomy-driven. |
