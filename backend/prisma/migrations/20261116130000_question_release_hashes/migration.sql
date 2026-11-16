-- Change detection for content releases: packages of reviewed questions
-- pushed from the editorial copy (local) to production through the admin API.
-- See src/modules/questions/application/question-release.ts.
--
-- Additive and backward compatible: three nullable columns that no older app
-- version reads or writes. Rolling the app back needs no database rollback;
-- an older version editing a released question simply leaves them as they
-- were, which the next push reports as "changed since the last push" — the
-- safe direction.
ALTER TABLE "pyq"."questions"
    ADD COLUMN "released_content_hash" CHAR(64),
    ADD COLUMN "released_state_hash" CHAR(64),
    ADD COLUMN "released_at" TIMESTAMPTZ(6),
    -- Written together by the push, never one without the others.
    ADD CONSTRAINT "questions_release_complete"
        CHECK (num_nulls("released_content_hash", "released_state_hash", "released_at") IN (0, 3));
