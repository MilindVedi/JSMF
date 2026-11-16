-- The month of the exam session a question was asked in, for exams held more
-- than once a year (FMGE in June and December, INI-CET in May and November),
-- so "FMGE June 2026" and "FMGE December 2026" stay apart.
-- Purely additive: one nullable column, NULL for every existing question
-- (shown as the year alone). The previous app version never reads it, so an
-- app rollback needs no database rollback.
ALTER TABLE "pyq"."questions"
    ADD COLUMN "session_month" SMALLINT,
    ADD CONSTRAINT "questions_session_month_range" CHECK ("session_month" BETWEEN 1 AND 12);
