-- Per-session confirmation email copy. Both nullable with no default, so every
-- existing session keeps the built-in wording until an admin types their own.
ALTER TABLE "live_sessions"
  ADD COLUMN "confirmation_subject" VARCHAR(200),
  ADD COLUMN "pending_join_link_text" VARCHAR(300);
