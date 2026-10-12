-- Read models for the PYQ app: per-question state and per-day activity.
-- Additive only: two new tables, no change to any existing one. Both are
-- derived from pyq.attempts and are backfilled here from it, so the release
-- that starts reading them sees complete data. An older app version neither
-- reads nor writes them; if the app is rolled back past this release and
-- forward again, run `npm run db:pyq:rebuild-read-models` to refresh them.

CREATE TABLE "pyq"."user_question_states" (
    "user_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "latest_correct" BOOLEAN,
    "last_answered_at" TIMESTAMPTZ(6),
    "last_correct_at" TIMESTAMPTZ(6),
    "last_wrong_at" TIMESTAMPTZ(6),
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "incorrect_count" INTEGER NOT NULL DEFAULT 0,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_question_states_pkey" PRIMARY KEY ("user_id","question_id")
);

CREATE INDEX "user_question_states_user_latest_idx"
    ON "pyq"."user_question_states"("user_id", "latest_correct", "last_answered_at" DESC);

ALTER TABLE "pyq"."user_question_states"
    ADD CONSTRAINT "user_question_states_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pyq"."user_question_states"
    ADD CONSTRAINT "user_question_states_question_id_fkey"
    FOREIGN KEY ("question_id") REFERENCES "pyq"."questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "pyq"."user_daily_activity" (
    "user_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "answered" INTEGER NOT NULL,

    CONSTRAINT "user_daily_activity_pkey" PRIMARY KEY ("user_id","day")
);

ALTER TABLE "pyq"."user_daily_activity"
    ADD CONSTRAINT "user_daily_activity_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill. The same statements the application runs per question/day
-- (QuestionStateService), here for every row at once.
INSERT INTO "pyq"."user_question_states"
    ("user_id", "question_id", "latest_correct", "last_answered_at", "last_correct_at",
     "last_wrong_at", "attempt_count", "incorrect_count", "flagged", "updated_at")
SELECT a.user_id,
       a.question_id,
       (array_agg(a.is_correct ORDER BY a.answered_at DESC) FILTER (WHERE a.answered_at IS NOT NULL))[1],
       max(a.answered_at),
       max(a.answered_at) FILTER (WHERE a.is_correct),
       max(a.answered_at) FILTER (WHERE a.answered_at IS NOT NULL AND NOT a.is_correct),
       count(a.answered_at)::int,
       count(*) FILTER (WHERE a.answered_at IS NOT NULL AND NOT a.is_correct)::int,
       bool_or(a.flagged),
       now()
FROM "pyq"."attempts" a
JOIN "pyq"."practice_sessions" s ON s.id = a.session_id
WHERE NOT (s.mode = 'TEST' AND s.status = 'IN_PROGRESS')
GROUP BY a.user_id, a.question_id
HAVING count(a.answered_at) > 0 OR bool_or(a.flagged);

INSERT INTO "pyq"."user_daily_activity" ("user_id", "day", "answered")
SELECT user_id, (answered_at AT TIME ZONE 'Asia/Kolkata')::date, count(*)::int
FROM "pyq"."attempts"
WHERE answered_at IS NOT NULL
GROUP BY 1, 2;
