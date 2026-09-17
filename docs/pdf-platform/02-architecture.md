# PDF Platform — Architecture

This document covers how the PDF platform is built. It sits underneath the platform-wide direction in [`docs/03-architecture.md`](../03-architecture.md) (NestJS + PostgreSQL + Redis + object storage, modular monolith) and does not contradict it — this is that direction, made concrete for the first product that actually needs a backend.

## Repository layout

```
JSMF/
  docs/                      Product, architecture, planning
  web/                       Next.js app — PYQ mock UI today, + PDF storefront and admin
  backend/                   NestJS API  ← new, created for this product
  mobile/                    (not yet created) Flutter
```

The PDF storefront and admin panel are **route groups inside the existing `web/` app**, not a separate frontend application. They share the JSMF brand, the design tokens, the UI component library, and — most importantly — the user account. A separate Next.js app would mean duplicating all of that and running two deployments to serve one brand on one domain.

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
  Adapters                ← Prisma, Google Cloud Storage, Razorpay — the replaceable parts
```

Two consequences of this that matter for the requirements:

- **The domain layer imports nothing from NestJS, Prisma, Razorpay, or GCS.** It is plain TypeScript. That is what makes the business rules testable without a database and portable if the framework ever changes.
- **Providers sit behind ports.** `PaymentProvider` and `StorageProvider` are interfaces; `RazorpayAdapter` and `GcsAdapter` implement them. Adding Stripe for international payments, or moving from GCS to S3, is a new adapter and a config change — not a rewrite through the codebase. This is the concrete answer to "loosely coupled".

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

## Storage and download access

Two buckets, with different access postures:

| Bucket | Visibility | Holds | Why |
|---|---|---|---|
| `jsmf-public-assets` | Public read | Cover images, thumbnails | Marketing assets meant to be seen and CDN-cached. Making these private would cost a signed-URL round trip to render a listing page. |
| `jsmf-private-content` | **Private, no public access** | The actual PDFs | This is the product. It must never be reachable without an entitlement check. |

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
         Mint a V4 signed URL, expiry ~5 minutes
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

## Frontend structure

```
web/src/app/
  (marketing)/          existing public site
  (app)/                existing PYQ application
  (auth)/               existing login/signup — extended to real auth
  (store)/              NEW  public storefront
      p/[slug]/           the shareable PDF page
      library/            My Library
      orders/             purchase history
  (admin)/              NEW  admin panel, role-gated
      products/           list, create, edit, publish
      orders/             order + refund management
      taxonomy/           manage categories and terms
```

The admin panel is a route group in the same app rather than a separate application, but it is gated by role at the middleware level and calls admin-only API endpoints that re-check the role server-side. Client-side route gating is treated as a UX convenience, never as the security boundary.

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
