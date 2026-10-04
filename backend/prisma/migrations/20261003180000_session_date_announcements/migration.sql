-- Track which seat holders have been told that a session's dates are now
-- confirmed.  Mirrors session_bundle_deliveries (same admin-triggered flow).
-- Purely additive — an older app version that does not know about this table
-- keeps working unchanged.

CREATE TYPE "AnnouncementStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

CREATE TABLE "session_date_announcements" (
  "id"                  UUID NOT NULL,
  "live_session_id"     UUID NOT NULL,
  "user_id"             UUID NOT NULL,
  "status"              "AnnouncementStatus" NOT NULL DEFAULT 'PENDING',
  "announced_starts_at" TIMESTAMPTZ(6),
  "last_error"          TEXT,
  "attempts"            INTEGER NOT NULL DEFAULT 0,
  "sent_at"             TIMESTAMPTZ(6),
  "created_at"          TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "session_date_announcements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "session_date_announcements_live_session_id_user_id_key"
  ON "session_date_announcements"("live_session_id", "user_id");

CREATE INDEX "session_date_announcements_live_session_id_status_idx"
  ON "session_date_announcements"("live_session_id", "status");

ALTER TABLE "session_date_announcements"
  ADD CONSTRAINT "session_date_announcements_live_session_id_fkey"
  FOREIGN KEY ("live_session_id") REFERENCES "live_sessions"("product_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "session_date_announcements"
  ADD CONSTRAINT "session_date_announcements_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
