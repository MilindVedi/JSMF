-- Exam-pattern mocks, the instructions-screen clock, and option shuffling.
-- Purely additive: new nullable/defaulted columns and two new tables. The
-- previous app version never reads any of them, so an app rollback needs no
-- database rollback.

-- Options: the admin's "keep option order" per question.
ALTER TABLE "pyq"."questions" ADD COLUMN "keep_option_order" BOOLEAN NOT NULL DEFAULT false;

-- Sessions: shuffle decision, when the clock started, the mock's pattern.
ALTER TABLE "pyq"."practice_sessions"
    ADD COLUMN "clock_started_at" TIMESTAMPTZ(6),
    ADD COLUMN "pattern" JSONB,
    ADD COLUMN "shuffle_options" BOOLEAN NOT NULL DEFAULT false;

-- Every session that exists already started its clock when it was created.
-- (From now on only a TEST waiting on its instructions screen has none.)
UPDATE "pyq"."practice_sessions" SET "clock_started_at" = "started_at" WHERE "clock_started_at" IS NULL;

-- CreateTable
CREATE TABLE "pyq"."exam_patterns" (
    "exam_id" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "pattern" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "exam_patterns_pkey" PRIMARY KEY ("exam_id"),
    CONSTRAINT "exam_patterns_pattern_is_object" CHECK (jsonb_typeof("pattern") = 'object')
);

-- CreateTable
CREATE TABLE "pyq"."practice_settings" (
    "id" VARCHAR(20) NOT NULL DEFAULT 'global',
    "shuffle_options" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "practice_settings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "practice_settings_singleton" CHECK ("id" = 'global')
);

-- AddForeignKey
ALTER TABLE "pyq"."exam_patterns" ADD CONSTRAINT "exam_patterns_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "pyq"."exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The one settings row: shuffling on.
INSERT INTO "pyq"."practice_settings" ("id", "shuffle_options", "updated_at") VALUES ('global', true, CURRENT_TIMESTAMP);

-- Each exam's published pattern, for the exams that exist (matched by slug;
-- an exam that is missing simply gets none, and admin can add it later).
-- "incorrect" is the marks taken off for a wrong answer, as an exact fraction.
INSERT INTO "pyq"."exam_patterns" ("exam_id", "enabled", "pattern", "updated_at")
SELECT e."id", true, p."pattern"::jsonb, CURRENT_TIMESTAMP
FROM "pyq"."exams" e
JOIN (VALUES
    -- NEET-PG: 180 questions in five time-bound sections of 36 × 42 min; +4 / −1.
    ('neet-pg', '{"version":1,"sectionsLocked":true,"marking":{"correct":{"num":4,"den":1},"incorrect":{"num":1,"den":1}},"sections":[{"name":"Section A","questions":36,"minutes":42},{"name":"Section B","questions":36,"minutes":42},{"name":"Section C","questions":36,"minutes":42},{"name":"Section D","questions":36,"minutes":42},{"name":"Section E","questions":36,"minutes":42}]}'),
    -- FMGE: 300 questions in two parts of 150 × 150 min; +1, no negative marking.
    ('fmge', '{"version":1,"sectionsLocked":true,"marking":{"correct":{"num":1,"den":1},"incorrect":{"num":0,"den":1}},"sections":[{"name":"Part A","questions":150,"minutes":150},{"name":"Part B","questions":150,"minutes":150}]}'),
    -- INI-CET: 200 questions, one 3-hour paper, free navigation; +1 / −1/3.
    ('inicet', '{"version":1,"sectionsLocked":false,"marking":{"correct":{"num":1,"den":1},"incorrect":{"num":1,"den":3}},"sections":[{"name":"Paper","questions":200,"minutes":180}]}')
) AS p("slug", "pattern") ON p."slug" = e."slug";
