-- Constraints that Prisma's schema language cannot express. These are not
-- decorative: each one moves a correctness guarantee out of application code,
-- where it depends on every future code path remembering to check, and into the
-- database, where it cannot be bypassed.

-- ---------------------------------------------------------------------------
-- At most ONE active entitlement per (user, product).
--
-- This is what makes a double-submitted payment, a duplicated Razorpay webhook,
-- or a race between the client verify call and the webhook unable to produce two
-- live grants. Revoked and expired rows are deliberately excluded so that
-- refunding and then re-buying the same PDF remains possible.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "entitlements_user_product_active_unique"
  ON "entitlements" ("user_id", "product_id")
  WHERE "status" = 'ACTIVE';

-- ---------------------------------------------------------------------------
-- At most ONE current asset per (product, kind).
--
-- Assets are versioned rather than overwritten so a corrected re-upload never
-- destroys the file people actually paid for. That only works if exactly one
-- version is marked current — otherwise "which PDF does a buyer get?" has no
-- deterministic answer.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "product_assets_current_unique"
  ON "product_assets" ("product_id", "kind")
  WHERE "is_current" = true;

-- ---------------------------------------------------------------------------
-- Pricing coherence.
--
-- Makes a free-but-priced or paid-but-zero product impossible at the database
-- level, rather than trusting the admin form to be the only way rows are ever
-- written.
-- ---------------------------------------------------------------------------
ALTER TABLE "products"
  ADD CONSTRAINT "products_price_matches_access_type"
  CHECK (
    ("access_type" = 'FREE' AND "price_amount_minor" = 0)
    OR
    ("access_type" = 'PAID' AND "price_amount_minor" > 0)
  );

-- A strike-through price that is not higher than the real price is a display
-- bug that would otherwise ship silently.
ALTER TABLE "products"
  ADD CONSTRAINT "products_compare_at_above_price"
  CHECK (
    "compare_at_amount_minor" IS NULL
    OR "compare_at_amount_minor" > "price_amount_minor"
  );

-- ---------------------------------------------------------------------------
-- Money is never negative.
-- ---------------------------------------------------------------------------
ALTER TABLE "products"
  ADD CONSTRAINT "products_price_non_negative"
  CHECK ("price_amount_minor" >= 0);

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_amounts_non_negative"
  CHECK (
    "subtotal_amount_minor" >= 0
    AND "discount_amount_minor" >= 0
    AND "tax_amount_minor" >= 0
    AND "total_amount_minor" >= 0
  );

-- The order total must actually be the sum of its parts. Without this, a bug in
-- coupon or tax arithmetic produces an order that charges one amount and reports
-- another — the kind of defect that is only discovered during a refund dispute.
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_total_is_consistent"
  CHECK (
    "total_amount_minor" = "subtotal_amount_minor" - "discount_amount_minor" + "tax_amount_minor"
  );

ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_amounts_valid"
  CHECK (
    "quantity" > 0
    AND "unit_price_amount_minor" >= 0
    AND "total_amount_minor" = "unit_price_amount_minor" * "quantity"
  );

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_amount_non_negative"
  CHECK ("amount_minor" >= 0);

ALTER TABLE "refunds"
  ADD CONSTRAINT "refunds_amount_positive"
  CHECK ("amount_minor" > 0);

-- ---------------------------------------------------------------------------
-- A term may not be its own parent. Deeper cycles are prevented in application
-- code; this catches the trivial case that a single bad UPDATE could create.
-- ---------------------------------------------------------------------------
ALTER TABLE "taxonomy_terms"
  ADD CONSTRAINT "taxonomy_terms_no_self_parent"
  CHECK ("parent_term_id" IS NULL OR "parent_term_id" <> "id");

-- ---------------------------------------------------------------------------
-- An entitlement that is REVOKED must record when, and one that is ACTIVE must
-- not claim to have been revoked. Keeps status and timestamps from drifting
-- apart into a state no reader can interpret.
-- ---------------------------------------------------------------------------
ALTER TABLE "entitlements"
  ADD CONSTRAINT "entitlements_revocation_is_coherent"
  CHECK (
    ("status" = 'REVOKED' AND "revoked_at" IS NOT NULL)
    OR ("status" <> 'REVOKED' AND "revoked_at" IS NULL)
  );
