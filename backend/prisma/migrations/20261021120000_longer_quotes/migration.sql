-- Quotes shown on the website can be as long as the longest answer a student
-- can write (LONG_TEXT_MAX, 5000), so any reply can be picked whole; until now
-- a reply over 1000 characters could not be picked at all.
-- Widening a VARCHAR is a catalogue change in Postgres: no table rewrite, no
-- long lock, and the previous app version (which still stops at 1000) keeps
-- working unchanged.
ALTER TABLE "feedback_highlights" ALTER COLUMN "quote" TYPE VARCHAR(5000);
ALTER TABLE "no_session_quotes" ALTER COLUMN "quote" TYPE VARCHAR(5000);
