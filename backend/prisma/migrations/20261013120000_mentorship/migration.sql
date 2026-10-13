-- One-to-one mentorship: a bookable product type, its weekly availability,
-- dated exceptions, and the bookings themselves.
--
-- Purely additive. Nothing existing is altered except one new value on the
-- ProductType enum, which no existing row uses. Rolling the application back
-- needs no database rollback: the old code never reads these tables, and it
-- never sees a MENTORSHIP product because none exists until an admin creates
-- one.
--
-- ALTER TYPE ... ADD VALUE inside a transaction is allowed (PostgreSQL 12+)
-- as long as the new value is not used in the same transaction; it is not.

-- btree_gist lets an exclusion constraint compare a plain uuid column with
-- `=` next to a time range with `&&`. Bundled with PostgreSQL and available on
-- Cloud SQL; IF NOT EXISTS makes this a no-op where it is already installed.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- CreateEnum
CREATE TYPE "MentorshipBookingStatus" AS ENUM ('PENDING_PAYMENT', 'CONFIRMED', 'PAID_UNSCHEDULED', 'EXPIRED', 'CANCELLED', 'COMPLETED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "MentorshipExceptionKind" AS ENUM ('BLOCK', 'EXTRA');

-- AlterEnum
ALTER TYPE "ProductType" ADD VALUE 'MENTORSHIP';

-- CreateTable
CREATE TABLE "mentorship_offerings" (
    "product_id" UUID NOT NULL,
    "duration_minutes" INTEGER NOT NULL DEFAULT 45,
    "buffer_minutes" INTEGER NOT NULL DEFAULT 15,
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
    "min_notice_minutes" INTEGER NOT NULL DEFAULT 720,
    "booking_window_days" INTEGER NOT NULL DEFAULT 21,
    "reschedule_cutoff_minutes" INTEGER NOT NULL DEFAULT 1440,
    "max_reschedules" INTEGER NOT NULL DEFAULT 2,
    "platform_label" VARCHAR(160) NOT NULL DEFAULT 'Google Meet',
    "highlights" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "mentorship_offerings_pkey" PRIMARY KEY ("product_id")
);

-- CreateTable
CREATE TABLE "mentorship_availability_rules" (
    "id" UUID NOT NULL,
    "offering_id" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "start_minute" INTEGER NOT NULL,
    "end_minute" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mentorship_availability_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mentorship_availability_exceptions" (
    "id" UUID NOT NULL,
    "offering_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "kind" "MentorshipExceptionKind" NOT NULL,
    "start_minute" INTEGER,
    "end_minute" INTEGER,
    "note" VARCHAR(160),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mentorship_availability_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mentorship_bookings" (
    "id" UUID NOT NULL,
    "offering_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "order_id" UUID,
    "status" "MentorshipBookingStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "blocked_until" TIMESTAMPTZ(6) NOT NULL,
    "hold_expires_at" TIMESTAMPTZ(6),
    "attendee_name" VARCHAR(120) NOT NULL,
    "whatsapp_number" VARCHAR(20),
    "exam" VARCHAR(40) NOT NULL,
    "notes" VARCHAR(1000),
    "meet_url" TEXT,
    "reschedule_count" INTEGER NOT NULL DEFAULT 0,
    "confirmed_at" TIMESTAMPTZ(6),
    "confirmation_sent_at" TIMESTAMPTZ(6),
    "meet_link_sent_at" TIMESTAMPTZ(6),
    "reminder_sent_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "cancel_reason" VARCHAR(300),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "mentorship_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mentorship_availability_rules_offering_id_weekday_idx" ON "mentorship_availability_rules"("offering_id", "weekday");

-- CreateIndex
CREATE INDEX "mentorship_availability_exceptions_offering_id_date_idx" ON "mentorship_availability_exceptions"("offering_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "mentorship_bookings_order_id_key" ON "mentorship_bookings"("order_id");

-- CreateIndex
CREATE INDEX "mentorship_bookings_offering_id_starts_at_idx" ON "mentorship_bookings"("offering_id", "starts_at");

-- CreateIndex
CREATE INDEX "mentorship_bookings_user_id_starts_at_idx" ON "mentorship_bookings"("user_id", "starts_at" DESC);

-- CreateIndex
CREATE INDEX "mentorship_bookings_status_starts_at_idx" ON "mentorship_bookings"("status", "starts_at");

-- AddForeignKey
ALTER TABLE "mentorship_offerings" ADD CONSTRAINT "mentorship_offerings_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentorship_availability_rules" ADD CONSTRAINT "mentorship_availability_rules_offering_id_fkey" FOREIGN KEY ("offering_id") REFERENCES "mentorship_offerings"("product_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentorship_availability_exceptions" ADD CONSTRAINT "mentorship_availability_exceptions_offering_id_fkey" FOREIGN KEY ("offering_id") REFERENCES "mentorship_offerings"("product_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentorship_bookings" ADD CONSTRAINT "mentorship_bookings_offering_id_fkey" FOREIGN KEY ("offering_id") REFERENCES "mentorship_offerings"("product_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentorship_bookings" ADD CONSTRAINT "mentorship_bookings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentorship_bookings" ADD CONSTRAINT "mentorship_bookings_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Integrity rules Prisma cannot express
-- ---------------------------------------------------------------------------

ALTER TABLE "mentorship_offerings"
  ADD CONSTRAINT "mentorship_offerings_values_sane" CHECK (
    "duration_minutes" BETWEEN 10 AND 240
    AND "buffer_minutes" BETWEEN 0 AND 120
    AND "min_notice_minutes" BETWEEN 0 AND 20160
    AND "booking_window_days" BETWEEN 1 AND 180
    AND "reschedule_cutoff_minutes" BETWEEN 0 AND 20160
    AND "max_reschedules" BETWEEN 0 AND 10
  );

-- Minutes after local midnight; a window may end exactly at midnight (1440).
ALTER TABLE "mentorship_availability_rules"
  ADD CONSTRAINT "mentorship_availability_rules_window_valid" CHECK (
    "weekday" BETWEEN 1 AND 7
    AND "start_minute" >= 0
    AND "end_minute" <= 1440
    AND "start_minute" < "end_minute"
  );

-- A block may cover the whole day (both minutes null) or a window; an extra
-- window always has both ends.
ALTER TABLE "mentorship_availability_exceptions"
  ADD CONSTRAINT "mentorship_availability_exceptions_window_valid" CHECK (
    ("start_minute" IS NULL AND "end_minute" IS NULL AND "kind" = 'BLOCK')
    OR (
      "start_minute" IS NOT NULL AND "end_minute" IS NOT NULL
      AND "start_minute" >= 0 AND "end_minute" <= 1440
      AND "start_minute" < "end_minute"
    )
  );

ALTER TABLE "mentorship_bookings"
  ADD CONSTRAINT "mentorship_bookings_times_valid" CHECK (
    "ends_at" > "starts_at" AND "blocked_until" >= "ends_at"
  );

ALTER TABLE "mentorship_bookings"
  ADD CONSTRAINT "mentorship_bookings_reschedule_count_valid" CHECK ("reschedule_count" >= 0);

-- A held slot always says when the hold lapses.
ALTER TABLE "mentorship_bookings"
  ADD CONSTRAINT "mentorship_bookings_hold_has_expiry" CHECK (
    "status" <> 'PENDING_PAYMENT' OR "hold_expires_at" IS NOT NULL
  );

-- The double-booking guard. Two bookings of one offering that are holding or
-- holding-and-paid can never overlap, including each one's buffer. The
-- database refuses the second insert or update however two requests race;
-- the service turns that refusal into "this time was just taken".
--
-- Lapsed holds (PENDING_PAYMENT past hold_expires_at) still count here until
-- they are marked EXPIRED. The service does exactly that, for the overlapping
-- rows only, in the same transaction before it holds a slot, and the
-- 5-minute sweep tidies the rest.
ALTER TABLE "mentorship_bookings"
  ADD CONSTRAINT "mentorship_bookings_no_overlap"
  EXCLUDE USING gist (
    "offering_id" WITH =,
    tstzrange("starts_at", "blocked_until", '[)') WITH &&
  )
  WHERE ("status" IN ('PENDING_PAYMENT', 'CONFIRMED'));
