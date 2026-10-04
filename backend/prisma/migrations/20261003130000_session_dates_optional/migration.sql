-- Sessions may now be announced before their dates are fixed.
--
-- A session with no `live_session_days` rows has no start, so `starts_at`
-- becomes nullable. The website shows "To be announced" for those, and
-- registration stays open because nothing has started yet.
--
-- Widening only: every existing session keeps its date and its NOT NULL value.

ALTER TABLE "live_sessions" ALTER COLUMN "starts_at" DROP NOT NULL;
