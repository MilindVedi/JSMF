-- Deferred delivery of a live session's included items (the bundled PDF).
--
-- Seats are often sold before the PDF exists. Until now the bundled item was
-- granted inside payment settlement or not at all, so anyone who paid before
-- the PDF was linked never received it. A session can now hold its included
-- items back and release them after it has ended — automatically, or when an
-- admin sends them.
--
-- Additive: every existing session defaults to IMMEDIATE, which is the
-- behaviour that was already in place.

CREATE TYPE "BundleDeliveryMode" AS ENUM ('IMMEDIATE', 'AUTO_AFTER_SESSION', 'MANUAL');
CREATE TYPE "BundleDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

ALTER TABLE "live_sessions"
  ADD COLUMN "bundle_delivery_mode" "BundleDeliveryMode" NOT NULL DEFAULT 'IMMEDIATE';

CREATE TABLE "session_bundle_deliveries" (
  "id" UUID NOT NULL,
  "live_session_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "status" "BundleDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "last_error" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "sent_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "session_bundle_deliveries_pkey" PRIMARY KEY ("id")
);

-- One row per buyer per session: what makes "send to everyone" skip the people
-- already served instead of mailing them twice.
CREATE UNIQUE INDEX "session_bundle_deliveries_live_session_id_user_id_key"
  ON "session_bundle_deliveries" ("live_session_id", "user_id");

CREATE INDEX "session_bundle_deliveries_live_session_id_status_idx"
  ON "session_bundle_deliveries" ("live_session_id", "status");

ALTER TABLE "session_bundle_deliveries"
  ADD CONSTRAINT "session_bundle_deliveries_live_session_id_fkey"
  FOREIGN KEY ("live_session_id") REFERENCES "live_sessions"("product_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "session_bundle_deliveries"
  ADD CONSTRAINT "session_bundle_deliveries_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
