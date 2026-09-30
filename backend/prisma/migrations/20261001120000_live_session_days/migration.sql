-- Multi-day sessions: each day becomes its own row, and reminders are tracked
-- per person per day. Existing sessions become one-day sessions unchanged.

-- CreateTable
CREATE TABLE "live_session_days" (
    "id" UUID NOT NULL,
    "live_session_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "live_session_days_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "live_session_days_duration_positive" CHECK ("duration_minutes" > 0)
);

-- CreateTable
CREATE TABLE "session_day_reminders" (
    "registration_id" UUID NOT NULL,
    "live_session_day_id" UUID NOT NULL,
    "sent_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_day_reminders_pkey" PRIMARY KEY ("registration_id", "live_session_day_id")
);

-- CreateIndex
CREATE INDEX "live_session_days_live_session_id_starts_at_idx" ON "live_session_days"("live_session_id", "starts_at");
CREATE INDEX "live_session_days_starts_at_idx" ON "live_session_days"("starts_at");
CREATE INDEX "session_day_reminders_live_session_day_id_idx" ON "session_day_reminders"("live_session_day_id");

-- AddForeignKey
ALTER TABLE "live_session_days" ADD CONSTRAINT "live_session_days_live_session_id_fkey" FOREIGN KEY ("live_session_id") REFERENCES "live_sessions"("product_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "session_day_reminders" ADD CONSTRAINT "session_day_reminders_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "session_registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "session_day_reminders" ADD CONSTRAINT "session_day_reminders_live_session_day_id_fkey" FOREIGN KEY ("live_session_day_id") REFERENCES "live_session_days"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: every existing session becomes a one-day session.
INSERT INTO "live_session_days" ("id", "live_session_id", "starts_at", "duration_minutes", "updated_at")
SELECT gen_random_uuid(), "product_id", "starts_at", "duration_minutes", CURRENT_TIMESTAMP
FROM "live_sessions";

-- Backfill: a reminder already sent counts as sent for that one day.
INSERT INTO "session_day_reminders" ("registration_id", "live_session_day_id", "sent_at")
SELECT r."id", d."id", r."reminder_sent_at"
FROM "session_registrations" r
JOIN "live_session_days" d ON d."live_session_id" = r."live_session_id"
WHERE r."reminder_sent_at" IS NOT NULL;

-- The per-day tables now hold these.
ALTER TABLE "live_sessions" DROP CONSTRAINT "live_sessions_duration_positive";
ALTER TABLE "live_sessions" DROP COLUMN "duration_minutes";
ALTER TABLE "session_registrations" DROP COLUMN "reminder_sent_at";
