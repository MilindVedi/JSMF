-- Session details: a Telegram group link per session, and a record of what each
-- attendee was actually sent (dates, joining link, Telegram link), so the admin
-- sees who needs what. Additive: one nullable column, two enums, two tables.
-- session_date_announcements stays; the code no longer writes to it.

-- CreateEnum
CREATE TYPE "SessionDetailSource" AS ENUM ('CONFIRMATION', 'DETAILS_EMAIL', 'REMINDER');

-- CreateEnum
CREATE TYPE "SessionDetailEmailStatus" AS ENUM ('SENT', 'FAILED');

-- AlterTable
ALTER TABLE "live_sessions" ADD COLUMN     "telegram_url" TEXT;

-- CreateTable
CREATE TABLE "session_detail_receipts" (
    "live_session_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "item" VARCHAR(40) NOT NULL,
    "value" TEXT NOT NULL,
    "source" "SessionDetailSource" NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "session_detail_receipts_pkey" PRIMARY KEY ("live_session_id","user_id","item")
);

-- CreateTable
CREATE TABLE "session_detail_emails" (
    "id" UUID NOT NULL,
    "live_session_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "items" JSONB NOT NULL,
    "status" "SessionDetailEmailStatus" NOT NULL,
    "error" TEXT,
    "sent_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_detail_emails_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "session_detail_emails_live_session_id_user_id_created_at_idx" ON "session_detail_emails"("live_session_id", "user_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "session_detail_receipts" ADD CONSTRAINT "session_detail_receipts_live_session_id_fkey" FOREIGN KEY ("live_session_id") REFERENCES "live_sessions"("product_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_detail_receipts" ADD CONSTRAINT "session_detail_receipts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_detail_emails" ADD CONSTRAINT "session_detail_emails_live_session_id_fkey" FOREIGN KEY ("live_session_id") REFERENCES "live_sessions"("product_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_detail_emails" ADD CONSTRAINT "session_detail_emails_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Like the joining link: a real link or nothing.
ALTER TABLE "live_sessions"
  ADD CONSTRAINT "live_sessions_telegram_url_https" CHECK ("telegram_url" IS NULL OR "telegram_url" ~ '^https://');

ALTER TABLE "session_detail_receipts"
  ADD CONSTRAINT "session_detail_receipts_item_not_blank" CHECK (length(trim("item")) > 0);

-- Carry over who already has the current dates. The fingerprint must match
-- datesFingerprint() in events/domain/session-details.ts exactly:
-- "<ISO start in UTC>/<minutes>", in start order, comma-separated.
--
-- Deliberately strict: a send only counts when it happened after the days last
-- changed (every save of the session touches them). This can only leave
-- someone marked "not sent" who did get the dates — a harmless extra email —
-- never mark someone told who was not.
WITH schedule AS (
  SELECT
    "live_session_id",
    string_agg(
      to_char("starts_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') || '/' || "duration_minutes",
      ',' ORDER BY "starts_at"
    ) AS "fingerprint",
    min("starts_at") AS "first_start",
    max("updated_at") AS "last_change"
  FROM "live_session_days"
  GROUP BY "live_session_id"
)
INSERT INTO "session_detail_receipts" ("live_session_id", "user_id", "item", "value", "source", "received_at")
SELECT a."live_session_id", a."user_id", 'dates', s."fingerprint", 'DETAILS_EMAIL'::"SessionDetailSource", a."sent_at"
FROM "session_date_announcements" a
JOIN schedule s ON s."live_session_id" = a."live_session_id"
WHERE a."status" = 'SENT'
  AND a."announced_starts_at" = s."first_start"
  AND a."sent_at" >= s."last_change"
ON CONFLICT DO NOTHING;

-- Real confirmations sent after the last change. Buyers added by hand are left
-- out: their confirmation_sent_at marks "told in person", not an email.
WITH schedule AS (
  SELECT
    "live_session_id",
    string_agg(
      to_char("starts_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') || '/' || "duration_minutes",
      ',' ORDER BY "starts_at"
    ) AS "fingerprint",
    max("updated_at") AS "last_change"
  FROM "live_session_days"
  GROUP BY "live_session_id"
)
INSERT INTO "session_detail_receipts" ("live_session_id", "user_id", "item", "value", "source", "received_at")
SELECT r."live_session_id", r."user_id", 'dates', s."fingerprint", 'CONFIRMATION'::"SessionDetailSource", r."confirmation_sent_at"
FROM "session_registrations" r
JOIN schedule s ON s."live_session_id" = r."live_session_id"
WHERE r."confirmation_sent_at" IS NOT NULL
  AND r."confirmation_sent_at" >= s."last_change"
  AND NOT EXISTS (SELECT 1 FROM "offline_sales" o WHERE o."order_id" = r."order_id")
  AND NOT EXISTS (SELECT 1 FROM "orders" o WHERE o."id" = r."order_id" AND o."notes" ? 'backfill')
ON CONFLICT DO NOTHING;
