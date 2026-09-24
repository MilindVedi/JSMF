# PDF Platform — Data Model

**This is the document to review.** Every table the PDF platform needs is below, with its columns, its constraints, and — where it is not obvious — why it is shaped that way.

## Conventions applied everywhere

| Convention | Rule | Why |
|---|---|---|
| Primary keys | `uuid` (v7 where the driver allows — time-sortable) | Safe to expose in APIs, no sequence enumeration leak (`/orders/3` telling a competitor how many orders exist), and generatable client-side for idempotent writes. |
| Money | `bigint` in **minor units** (paise), plus a `currency char(3)` | Floating point must never touch money. `₹199.00` is stored as `19900`. Every amount column ends in `_amount_minor` so a float can never be introduced by accident without it being visible in review. |
| Timestamps | `timestamptz`, never `timestamp` | The server, the doctor, and the student will not always be in one timezone; storing without an offset guarantees a bug later. |
| Every table | `created_at`, and `updated_at` where rows mutate | Baseline auditability. |
| Deletion | Soft delete (`deleted_at`) as the platform-wide default | Anything purchasable (products) must never be hard-deleted — it would destroy a buyer's library and the order history behind a real payment. The same default extends to other customer-facing rows (taxonomy terms, product links): a removal made by mistake, or one an admin wants to reverse, should not require retyping data or losing the id other rows may still reference. Join tables (`product_taxonomy_terms`) are the exception — they carry no data of their own beyond the relationship, so there is nothing a soft delete would preserve. |
| Enums | Postgres native enums | Type-safe and readable in raw SQL. Values listed per column below. |
| Naming | `snake_case` tables and columns, plural table names | One consistent convention, mapped to camelCase in TypeScript by Prisma. |

---

## 1. Identity

`users`, `roles`, `user_roles`, and `refresh_tokens` are documented in their own place, **[`docs/identity/02-data-model.md`](../identity/02-data-model.md)**, because they are owned by the platform-wide identity module and used by every JSMF application — not something specific to this product. Every table below that references a person (`products.author_user_id`, `orders.user_id`, `entitlements.user_id`, and others) points at `users` there.

---

## 2. Catalogue

### `products` — the core entity

There is no `pdfs` table. See [Architecture](./02-architecture.md#content-model-products-not-pdfs) for why.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `type` | enum NOT NULL | `PDF`, `VIDEO`, `COURSE`, `BUNDLE`. **V1 only ever writes `PDF`** — the others exist so adding them later is a new row, not a new table. |
| `slug` | varchar(160) | **UNIQUE NOT NULL.** The public URL `/p/pathology-rapid-revision`. Immutable once published — this link goes in YouTube descriptions permanently, so changing it must be a deliberate act with a redirect, not a side effect of editing a title. |
| `title` | varchar(200) NOT NULL | |
| `subtitle` | varchar(300) NULL | The short description shown on cards and under the title. |
| `description` | text NULL | Long description, markdown. |
| *(no cover image column)* | | The cover is a `product_assets` row with `kind = COVER_IMAGE`, not a URL column — see below. A raw external URL is never stored, whether it came from an admin upload or an admin pasting a link: the service layer always re-uploads the image to our own storage first and records the resulting `object_key`. |
| `status` | enum NOT NULL | `DRAFT`, `PUBLISHED`, `UNPUBLISHED`, `ARCHIVED`. Default `DRAFT`. `UNPUBLISHED` is reversible; `ARCHIVED` is the soft delete. |
| `access_type` | enum NOT NULL | `FREE`, `PAID`. Explicit rather than inferred from `price = 0`, so "free" is a stated intent and a price of 0 on a paid product is a constraint violation instead of a silent giveaway. |
| `price_amount_minor` | bigint NOT NULL DEFAULT 0 | |
| `compare_at_amount_minor` | bigint NULL | For "~~₹499~~ ₹199" display. |
| `currency` | char(3) NOT NULL DEFAULT `'INR'` | |
| `author_user_id` | uuid FK→users NULL | Who published it. Present from day one so "multiple doctors publishing" is additive. |
| `language` | varchar(10) DEFAULT `'en'` | |
| `metadata` | jsonb NOT NULL DEFAULT `'{}'` | Escape hatch for type-specific fields (a video's duration) that do not deserve a column on every product. Never used for anything queried or filtered — those become taxonomy terms or real columns. |
| `published_at` | timestamptz NULL | Set on first publish, not on every edit. |
| `created_by`, `updated_by` | uuid FK→users | |
| `created_at`, `updated_at`, `deleted_at` | timestamptz | |

**Constraints**

- `CHECK ((access_type = 'FREE' AND price_amount_minor = 0) OR (access_type = 'PAID' AND price_amount_minor > 0))` — makes a free-but-priced or paid-but-zero product impossible at the database level rather than depending on the admin form.
- `CHECK (compare_at_amount_minor IS NULL OR compare_at_amount_minor > price_amount_minor)`

**Indexes** — `(status, published_at DESC)` for the storefront listing; `(type)`; unique on `slug`; `(author_user_id)`.

### `product_assets` — every file a product owns, public or private

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `product_id` | uuid FK→products **ON DELETE RESTRICT** | A product is never supposed to be hard-deleted at all (only archived), so this is a backstop against a bug or a stray admin action doing it anyway — not a case the application is expected to hit. |
| `kind` | enum NOT NULL | `PRIMARY_FILE`, `SAMPLE_PREVIEW`, `ATTACHMENT`, `COVER_IMAGE`. A free sample of a paid PDF is just an asset with a different kind — and so is the cover image. `COVER_IMAGE` is the one public kind here; every other kind is private and entitlement-gated. Which bucket a row belongs in is a service-layer rule keyed on `kind`, not a column — see [Architecture](./02-architecture.md#storage-and-download-access). |
| `storage_provider` | enum NOT NULL | `CLOUDINARY` (the intended production provider), `LOCAL` (development), `GCS`, `S3`. Recorded **per asset**, with no default — see below. |
| `bucket` | varchar(255) NOT NULL | The bucket for bucket-based providers; the Cloudinary folder for Cloudinary. |
| `object_key` | text NOT NULL | e.g. `products/{productId}/v2/file.pdf`. For Cloudinary this is the `public_id`. |
| `original_filename` | varchar(255) | What the user's download is named. |
| `mime_type` | varchar(120) | |
| `size_bytes` | bigint | |
| `checksum_sha256` | varchar(64) | Detects a corrupted upload, and detects an accidental re-upload of an identical file. |
| `page_count` | int NULL | PDF-specific, shown on the product page. |
| `version` | int NOT NULL DEFAULT 1 | |
| `is_current` | boolean NOT NULL DEFAULT true | |
| `uploaded_by` | uuid FK→users | |
| `created_at` | timestamptz | |

**Why versioned:** the doctor will find a typo and re-upload. A new row with `version = 2, is_current = true` (and the old row flipped to `false`) means buyers automatically get the corrected file, the old file is still there for audit, and nobody's download link breaks. Overwriting the object in place would silently destroy the only copy of what people actually paid for — and now that the cover image is a row in this same table, replacing it gets the exact same protection for free, rather than needing its own mechanism.

**Why the cover image lives here instead of a `cover_image_url` column on `products`:** a URL column can only ever hold whatever the last write put in it — including, if nobody stops it, a link to someone else's storage. Modeling the cover as a normal `product_assets` row removes that possibility structurally rather than by convention: there is no column to put a raw URL into. However an image arrives — an admin's own upload, or a URL an admin pastes into a form — the service layer downloads or receives the bytes and uploads them to our own storage before a row is ever written; `object_key` always points at something we control. The tradeoff is that rendering a listing page now needs a join to fetch each product's current cover instead of reading a column directly — cheap in practice (`WHERE kind = 'COVER_IMAGE' AND is_current` batches across many products in one query), and worth it for never being able to store someone else's URL by accident.

**Why the provider is stored per asset and has no default:** migrating from Cloudinary to GCS (or anywhere else) later is then a background job that moves files and updates rows one at a time, with both providers serving traffic during the move — rather than a flag day where flipping one config value makes every existing asset's recorded location a lie. Omitting the default is deliberate too: the code doing the upload always knows where it just put the file, and a default would let a forgotten field silently record a location the file is not at.

**Indexes** — partial unique on `(product_id, kind) WHERE is_current` so there can only ever be one current primary file.

### `product_links`

`id` uuid PK, `product_id` FK→products **ON DELETE RESTRICT**, `kind` enum (`YOUTUBE`, `INSTAGRAM`, `TELEGRAM`, `WEBSITE`, `OTHER`), `url` text NOT NULL, `label` varchar(160) NULL, `sort_order` int DEFAULT 0, `created_at`, `deleted_at` timestamptz NULL.

A table rather than a `youtube_url` column on `products`, so that "also link the Instagram reel" is data entry rather than a migration. `RESTRICT` for the same reason as `product_assets` above — the curated link that lives in a YouTube description is exactly the kind of thing that should never silently disappear.

`deleted_at`: soft delete, consistent with the rest of the platform. Removing a link is reversible — an admin who takes one down (or added it by mistake) does not lose the URL and label they typed, and can restore it rather than retyping it.

---

## 3. Taxonomy — the extensibility commitment

This is the part of the schema that answers *"later we can easily add more categories other than subject, topic"*.

### `taxonomies` — the kinds of category that exist

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `key` | varchar(60) UNIQUE NOT NULL | `subject`, `topic`, `exam`, `content_format`, `tag` |
| `name` | varchar(120) NOT NULL | Shown as the field label in admin and the filter heading in the storefront. |
| `description` | text NULL | |
| `is_hierarchical` | boolean DEFAULT false | Whether terms may nest (topics under subjects). |
| `is_multi_select` | boolean DEFAULT true | Whether a product may carry more than one term of this kind. |
| `sort_order` | int DEFAULT 0 | Controls field order in the admin form and filter order in the storefront. |
| `created_at`, `updated_at` | timestamptz | |

### `taxonomy_terms` — the values

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `taxonomy_id` | uuid FK→taxonomies **ON DELETE RESTRICT** | Self-referencing note below. Master data: deleting a taxonomy *kind* (e.g. "subject") used to cascade-delete every term under it, each of which cascaded again into every product tag using that term — one delete on a single row could have silently untagged the entire catalog. `RESTRICT` means a taxonomy kind's terms must be cleared out first, deliberately. |
| `parent_term_id` | uuid FK→taxonomy_terms NULL | Self-referencing. A `topic` term's parent is a `subject` term — deliberately allowed to cross taxonomies, which is what makes Subject → Topic nesting work without a bespoke table. |
| `slug` | varchar(120) NOT NULL | |
| `name` | varchar(160) NOT NULL | |
| `description` | text NULL | |
| `sort_order` | int DEFAULT 0 | |
| `metadata` | jsonb DEFAULT `'{}'` | |
| `created_at`, `updated_at` | timestamptz | |
| `deleted_at` | timestamptz NULL | Soft delete. A term is only deletable while unused (see `RESTRICT` above), so this is what makes that deletion reversible instead of destroying the term's id, description and history outright. |

**Constraints** — a **PARTIAL unique index** on `(taxonomy_id, slug) WHERE deleted_at IS NULL`, not a plain `UNIQUE`. A plain unique constraint would make a slug freed up by soft-deleting a term permanently unavailable, even though the row it belonged to is no longer visible anywhere — the same reasoning as `entitlements_user_product_active_unique`. **Indexes** — `(parent_term_id)`, `(taxonomy_id, sort_order)`.

### `product_taxonomy_terms`

`product_id` FK→products ON DELETE CASCADE, `term_id` FK→taxonomy_terms **ON DELETE RESTRICT**, `created_at`. **PK (`product_id`, `term_id`)**. Index on `(term_id)` for "every PDF in Pathology".

The `product_id` side stays `CASCADE` — deleting a product's own tag-assignment rows when the product itself goes is harmless. The `term_id` side is `RESTRICT`: this is the sharper edge of the taxonomy risk above, since deleting one term directly (e.g. "Pathology") is a far more plausible mistake than deleting a whole taxonomy kind, and nothing used to stop it from silently stripping that tag off every product that had it. A term in active use must be explicitly untagged before it can be deleted.

**What this buys:** adding "Difficulty" or "Year" as a new filter is one row in `taxonomies` plus its terms. No migration, no deploy, no code change — because the admin form and the storefront filter rail are both rendered from whatever is in these tables rather than from hardcoded fields. That is the whole reason for the indirection, and it is the difference between this being a PDF shop and being the content platform described in the long-term goal.

---

## 4. Orders and payments

### `orders`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `order_number` | varchar(30) UNIQUE NOT NULL | Human-readable, e.g. `JSMF-2026-000412`. Support conversations need something a person can read over the phone; a UUID is not that. |
| `user_id` | uuid FK→users | |
| `status` | enum NOT NULL | `CREATED`, `AWAITING_PAYMENT`, `PAID`, `FAILED`, `CANCELLED`, `REFUNDED`, `PARTIALLY_REFUNDED` |
| `subtotal_amount_minor` | bigint NOT NULL | |
| `discount_amount_minor` | bigint NOT NULL DEFAULT 0 | Separated from day one so coupons do not require restructuring totals later. |
| `tax_amount_minor` | bigint NOT NULL DEFAULT 0 | GST will matter; leaving it out now means retrofitting it across orders, invoices, and refunds. |
| `total_amount_minor` | bigint NOT NULL | What was actually charged. |
| `currency` | char(3) NOT NULL DEFAULT `'INR'` | |
| `customer_email`, `customer_phone` | varchar | **Snapshots.** A user changing their email must not rewrite the contact details on a past invoice. |
| `coupon_id` | uuid FK→coupons NULL | Reserved; unused in V1. |
| `notes` | jsonb DEFAULT `'{}'` | |
| `created_at`, `updated_at`, `paid_at`, `cancelled_at` | timestamptz | |

**Indexes** — `(user_id, created_at DESC)`, `(status)`, unique on `order_number`.

### `order_items`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `order_id` | uuid FK→orders ON DELETE CASCADE | |
| `product_id` | uuid FK→products **ON DELETE RESTRICT** | Restrict, not cascade: a product that has been sold can never be hard-deleted. This is why archiving exists. |
| `product_title_snapshot` | varchar(200) NOT NULL | |
| `product_type_snapshot` | enum NOT NULL | |
| `unit_price_amount_minor` | bigint NOT NULL | |
| `quantity` | int NOT NULL DEFAULT 1 | |
| `total_amount_minor` | bigint NOT NULL | |
| `created_at` | timestamptz | |

**The snapshots are the point.** If the doctor renames the PDF or raises its price next month, every past invoice must still show what the customer actually bought and paid. Joining live to `products` for the invoice would silently rewrite financial history.

**Constraints** — `UNIQUE (order_id, product_id)`.

### `payments`

A separate table from `orders` because one order can have several payment attempts (a failed card, then UPI), because provider payloads are large and should not bloat the order row, and because a second provider later is then a value in a column rather than a schema change.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `order_id` | uuid FK→orders | |
| `provider` | enum NOT NULL | `RAZORPAY` |
| `provider_order_id` | varchar(120) | Razorpay `order_…` |
| `provider_payment_id` | varchar(120) NULL | Razorpay `pay_…`. **UNIQUE where not null** — the same payment can never be recorded twice. |
| `provider_signature` | text NULL | |
| `status` | enum NOT NULL | `CREATED`, `AUTHORIZED`, `CAPTURED`, `FAILED`, `REFUNDED` |
| `amount_minor` | bigint NOT NULL | |
| `currency` | char(3) NOT NULL | |
| `method` | varchar(40) NULL | `upi`, `card`, `netbanking` — useful for knowing what students actually use. |
| `error_code`, `error_description` | varchar/text NULL | |
| `raw_response` | jsonb | Kept verbatim. When a payment dispute happens, the provider's own payload is the evidence. |
| `created_at`, `updated_at`, `captured_at` | timestamptz | |

**Indexes** — `(order_id)`, `(provider_order_id)`, unique partial on `(provider_payment_id) WHERE provider_payment_id IS NOT NULL`.

### `payment_webhook_events` — the idempotency guard

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `provider` | enum NOT NULL | |
| `provider_event_id` | varchar(160) | **UNIQUE NOT NULL.** This single constraint is what makes duplicate webhook delivery harmless. |
| `event_type` | varchar(80) NOT NULL | `payment.captured`, `refund.processed`, … |
| `payload` | jsonb NOT NULL | |
| `signature_valid` | boolean NOT NULL | |
| `status` | enum NOT NULL | `RECEIVED`, `PROCESSED`, `IGNORED`, `FAILED` |
| `processing_error` | text NULL | |
| `received_at`, `processed_at` | timestamptz | |

**Why this table is not optional:** Razorpay retries webhooks on any non-2xx response, and can deliver the same event more than once even on success. Without a unique event id recorded *before* processing, a retry grants a second entitlement or issues a second refund. Every webhook handler writes this row first and aborts on conflict.

### `refunds`

`id` uuid PK, `payment_id` FK→payments, `order_id` FK→orders, `provider_refund_id` varchar(120) UNIQUE, `amount_minor` bigint, `status` enum (`PENDING`, `PROCESSED`, `FAILED`), `reason` text, `initiated_by` FK→users NULL, `raw_response` jsonb, `created_at`, `processed_at`.

A refund sets the related entitlement to `REVOKED` — which is exactly why entitlements are their own table rather than being inferred from "does a paid order exist".

---

## 5. Access

### `entitlements` — who may download what

This is the heart of access control. Every download check reads this table and only this table.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK→users | |
| `product_id` | uuid FK→products | |
| `source` | enum NOT NULL | `PURCHASE`, `FREE_CLAIM`, `ADMIN_GRANT`, `SUBSCRIPTION`, `BUNDLE` |
| `source_order_id` | uuid FK→orders NULL | |
| `source_product_id` | uuid FK→products NULL | The bundle this was granted through, when `source = BUNDLE`. |
| `status` | enum NOT NULL | `ACTIVE`, `REVOKED`, `EXPIRED` |
| `granted_at` | timestamptz NOT NULL | |
| `expires_at` | timestamptz NULL | NULL = perpetual, which is all V1 grants. Present now so subscriptions and rentals need no migration. |
| `revoked_at`, `revoked_reason` | timestamptz / text NULL | |
| `created_at`, `updated_at` | timestamptz | |

**Constraints** — a **partial unique index on (`user_id`, `product_id`) WHERE `status = 'ACTIVE'`**. This is the database-level guarantee that a double-submitted payment or a duplicate webhook cannot produce two live grants. Correctness does not depend on the application checking first.

**Indexes** — `(user_id, status)` for My Library, `(product_id)` for "how many people own this".

**Why a separate table rather than deriving access from paid orders:** free claims, admin gifts, bundle contents, refund revocation, and future subscriptions all grant or remove access without a one-to-one paid order behind them. One table that every path writes to means the download endpoint has exactly one question to ask.

### `content_access_events` — the audit and analytics log

`id` uuid PK, `user_id` FK→users NULL (null for an anonymous free download), `product_id` FK→products **NULL, ON DELETE SET NULL**, `asset_id` FK→product_assets **NULL, ON DELETE SET NULL**, `entitlement_id` FK→entitlements NULL, `signed_url_expires_at` timestamptz, `ip` inet, `user_agent` text, `created_at`.

**Indexes** — `(product_id, created_at DESC)`, `(user_id, created_at DESC)`.

Written on every signed-URL mint. This is what makes "download management" and "engagement analytics" possible later — and it has to be collected from day one, because the expensive part of an analytics feature is the history you did not record, not the chart.

**Why `product`/`asset` are `SET NULL` rather than `CASCADE`:** this table's entire purpose is to be a record that outlives the thing it recorded. A *sold* product can never be hard-deleted anyway — `order_items`/`entitlements` restrict that — but a **free** product has nothing else stopping it from being deleted, and an audit log that can be erased by deleting what it was auditing has failed at its one job. `SET NULL` keeps the event row; only its pointer to the now-gone product or asset goes null.

---

## 6. `audit_logs` — built

**`audit_logs`** — `id`, `actor_user_id` FK→users (`SetNull`, so the trail outlives a deleted account), `action` varchar(80) (a past-tense verb scoped by entity, e.g. `product.published`), `entity_type`, `entity_id`, `before` jsonb, `after` jsonb, `ip`, `created_at`.

Written by `AuditService` (`backend/src/shared/audit/audit.service.ts`), which every admin mutation in the catalog and taxonomy modules calls — product create/update/publish/unpublish/archive/restore, asset uploads and version rollbacks, taxonomy and term create/update/delete/restore, and term assignment. Each write happens **inside the same database transaction as the change it describes**, so a published product with no audit row, or an audit row for a publish that was rolled back, are both impossible — logging after the fact and hoping it succeeds would allow either. Money values in `before`/`after` are converted from `BigInt` to strings before being stored, the same rule the API applies at its own boundary, so auditing a priced entity never throws.

Not yet wired into the `orders`/`payments`/`entitlements` modules — those changes are traceable today only through the tables' own timestamps and the `payment_webhook_events` record, not a unified audit trail.

## 7. Designed, deliberately not built in V1

These are specified so the tables above do not need reshaping when they arrive. **No code in V1 writes to them.**

**`coupons`** — `id`, `code` citext UNIQUE, `discount_type` enum (`PERCENT`, `FIXED`), `discount_value` int, `max_redemptions` int NULL, `per_user_limit` int NULL, `min_order_amount_minor` bigint NULL, `applies_to` jsonb (product ids or taxonomy terms), `starts_at`, `ends_at`, `status`, `created_at`.

**`coupon_redemptions`** — `id`, `coupon_id` FK, `user_id` FK, `order_id` FK, `discount_amount_minor`, `created_at`, `UNIQUE (coupon_id, order_id)`.

**`product_bundle_items`** — `bundle_product_id` FK→products, `child_product_id` FK→products, `sort_order`, PK on both. Buying the bundle grants an entitlement per child, with `source = BUNDLE`.

**`publisher_profiles`** — `user_id` PK FK→users, `display_name`, `slug` UNIQUE, `bio`, `avatar_storage_provider` + `avatar_object_key` (same pattern as `users`, not a URL), `payout_details` jsonb, `revenue_share_percent`. For the multi-educator marketplace.

---

## Table summary

| # | Table | Built in V1 | Purpose |
|---|---|---|---|
| 1 | `users` | ✅ | Accounts |
| 2 | `roles` | ✅ | Role definitions |
| 3 | `user_roles` | ✅ | Who is admin/educator/student |
| 4 | `refresh_tokens` | ✅ | Session management |
| 5 | `products` | ✅ | The catalogue (type-discriminated) |
| 6 | `product_assets` | ✅ | Private files, versioned |
| 7 | `product_links` | ✅ | YouTube and other links |
| 8 | `taxonomies` | ✅ | Kinds of category |
| 9 | `taxonomy_terms` | ✅ | Category values, nestable |
| 10 | `product_taxonomy_terms` | ✅ | Product ↔ category |
| 11 | `orders` | ✅ | Purchases |
| 12 | `order_items` | ✅ | Line items with snapshots |
| 13 | `payments` | ✅ | Razorpay attempts |
| 14 | `payment_webhook_events` | ✅ | Idempotency guard |
| 15 | `refunds` | ✅ | Refund records |
| 16 | `entitlements` | ✅ | **Access control** |
| 17 | `content_access_events` | ✅ | Download audit + analytics |
| 18 | `audit_logs` | ✅ | Admin action trail (catalog + taxonomy only, see §6) |
| 19 | `coupons` / `coupon_redemptions` | ⬜ | Designed only |
| 20 | `product_bundle_items` | ⬜ | Designed only |
| 21 | `publisher_profiles` | ⬜ | Designed only |

## The five decisions worth pushing back on

If any of these are wrong, they are far cheaper to change now than after the first real payment:

1. **`products` instead of `pdfs`.** Costs a little indirection in V1; saves rewriting orders, payments, entitlements, and the library when videos arrive.
2. **Taxonomy tables instead of `subject_id` / `topic_id` columns.** Costs three tables and a join; delivers the "add categories later without rework" requirement literally.
3. **Entitlements as their own table.** Costs one write per purchase; makes free claims, gifts, bundles, refunds, and subscriptions all use one access check.
4. **Snapshots on `order_items`.** Costs duplicated data; keeps financial history honest when prices and titles change.
5. **Money as `bigint` paise.** Slightly more code at the display boundary; removes an entire category of rounding bugs.
