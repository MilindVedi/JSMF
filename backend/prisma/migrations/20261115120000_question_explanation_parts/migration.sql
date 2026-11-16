-- The parts of an explanation every question has, stored on their own so they
-- can be shown and reused apart from the free-form explanation: why each option
-- is right or wrong (kept on the option, so it stays right when options are
-- shuffled), the high-yield pearls / buzzwords, and the quick revision line.
-- Purely additive: nullable columns and an array defaulting to empty. Existing
-- questions keep everything in `explanation`, shown as before; the previous
-- app version never reads these columns, so an app rollback needs no database
-- rollback.
ALTER TABLE "pyq"."question_options" ADD COLUMN "explanation" TEXT;

ALTER TABLE "pyq"."questions"
    ADD COLUMN "pearls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN "quick_revision" TEXT;
