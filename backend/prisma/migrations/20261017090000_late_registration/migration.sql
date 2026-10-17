-- Keep a multi-day session on sale after day 1 has started, until its last day
-- ends. Additive: every existing session defaults to false, which is exactly
-- today's behaviour (registration closes when the first day starts).
ALTER TABLE "live_sessions"
  ADD COLUMN "late_registration" BOOLEAN NOT NULL DEFAULT false;
