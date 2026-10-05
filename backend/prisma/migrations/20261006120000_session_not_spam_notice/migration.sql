-- Per-session toggle for the "mark as Not spam" info box appended to every
-- email we send for that session. Defaults off so every existing session is
-- unchanged until an admin opts in.
ALTER TABLE "live_sessions"
  ADD COLUMN "show_not_spam_notice" BOOLEAN NOT NULL DEFAULT false;
