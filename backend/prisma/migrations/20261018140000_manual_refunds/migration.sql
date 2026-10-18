-- Refunds an admin made outside Razorpay (UPI, bank, cash) and recorded in JSMF.
-- Additive only: existing rows keep NULL in both new columns, meaning "through
-- the payment provider", which is what every existing row is.

CREATE TYPE "ManualRefundMethod" AS ENUM ('UPI', 'BANK_TRANSFER', 'CASH', 'OTHER');

ALTER TABLE "refunds"
  ADD COLUMN "manual_method" "ManualRefundMethod",
  ADD COLUMN "reference" VARCHAR(100);

-- A refund went through the provider or outside it, never both.
ALTER TABLE "refunds"
  ADD CONSTRAINT "refunds_manual_has_no_provider_id"
  CHECK ("manual_method" IS NULL OR "provider_refund_id" IS NULL);

-- A reference only describes a manual refund.
ALTER TABLE "refunds"
  ADD CONSTRAINT "refunds_reference_only_when_manual"
  CHECK ("reference" IS NULL OR "manual_method" IS NOT NULL);
