-- A day extends the streak only once it reaches the student's daily goal,
-- instead of on a single answer. Recorded per day rather than compared
-- against the current target on read, so raising the goal later cannot erase
-- days already earned under the old one.
ALTER TABLE "pyq"."user_daily_activity"
    ADD COLUMN "goal_met" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: historical targets were never stored, so judge past days by the
-- student's target today (10 where they never set one). Without this every
-- existing streak would read zero the moment this ships.
UPDATE "pyq"."user_daily_activity" d
SET "goal_met" = d."answered" >= COALESCE(
    (SELECT p."daily_target" FROM "pyq"."user_preferences" p WHERE p."user_id" = d."user_id"),
    10);
