-- Live sessions for the main website (jsmf.me).
--
-- A session is a `products` row of type LIVE_SESSION, so orders, payments,
-- refunds and entitlements are reused unchanged. These two tables hold only
-- what a session has and a PDF does not. Every foreign key is RESTRICT (or
-- SET NULL for the informational order link): nothing about a sold session is
-- ever removed by a cascade.

-- AlterEnum
ALTER TYPE "ProductType" ADD VALUE 'LIVE_SESSION';

-- CreateTable
CREATE TABLE "live_sessions" (
    "product_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "platform_label" VARCHAR(160) NOT NULL,
    "capacity" INTEGER,
    "join_url" TEXT,
    "recording_url" TEXT,
    "highlights" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "perk_text" VARCHAR(300),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "live_sessions_pkey" PRIMARY KEY ("product_id")
);

-- CreateTable
CREATE TABLE "session_registrations" (
    "id" UUID NOT NULL,
    "live_session_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "whatsapp_number" VARCHAR(20) NOT NULL,
    "exam" VARCHAR(40) NOT NULL,
    "stage" VARCHAR(40) NOT NULL,
    "order_id" UUID,
    "confirmation_sent_at" TIMESTAMPTZ(6),
    "reminder_sent_at" TIMESTAMPTZ(6),
    "attended_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "session_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "live_sessions_starts_at_idx" ON "live_sessions"("starts_at");

-- CreateIndex
CREATE INDEX "session_registrations_user_id_idx" ON "session_registrations"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "session_registrations_live_session_id_user_id_key" ON "session_registrations"("live_session_id", "user_id");

-- AddForeignKey
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_registrations" ADD CONSTRAINT "session_registrations_live_session_id_fkey" FOREIGN KEY ("live_session_id") REFERENCES "live_sessions"("product_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_registrations" ADD CONSTRAINT "session_registrations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_registrations" ADD CONSTRAINT "session_registrations_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Integrity rules Prisma cannot express, enforced by the database so that no
-- admin form or future script can write a nonsensical session.
ALTER TABLE "live_sessions"
  ADD CONSTRAINT "live_sessions_duration_positive" CHECK ("duration_minutes" > 0),
  ADD CONSTRAINT "live_sessions_capacity_positive" CHECK ("capacity" IS NULL OR "capacity" > 0),
  ADD CONSTRAINT "live_sessions_join_url_https" CHECK ("join_url" IS NULL OR "join_url" ~ '^https?://'),
  ADD CONSTRAINT "live_sessions_recording_url_https" CHECK ("recording_url" IS NULL OR "recording_url" ~ '^https?://');
