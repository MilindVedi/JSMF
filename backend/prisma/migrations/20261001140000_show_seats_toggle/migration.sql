-- Admin toggle: when false, seat counts (both seatsRemaining and displaySeats)
-- are hidden from the public API. Default true preserves current behaviour.
ALTER TABLE "live_sessions" ADD COLUMN "show_seats" BOOLEAN NOT NULL DEFAULT TRUE;
