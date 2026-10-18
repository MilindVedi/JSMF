-- Feedback forms on jsmf.me, replacing the Google Form.
--
-- Additive only: four new enums and six new tables. No existing table or
-- column is changed, so the running app and a rollback are both unaffected.
--
-- The CHECK constraints at the end are not expressible in schema.prisma and
-- are load-bearing: they keep an answer in range even if a future caller
-- skips the service validation.
-- CreateEnum
CREATE TYPE "FeedbackFormStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "FeedbackEmailMode" AS ENUM ('AUTO_AFTER_DAY', 'MANUAL');

-- CreateEnum
CREATE TYPE "FeedbackQuestionKind" AS ENUM ('RATING', 'SCALE', 'SHORT_TEXT', 'LONG_TEXT', 'SINGLE_CHOICE', 'MULTI_CHOICE');

-- CreateEnum
CREATE TYPE "FeedbackResponseSource" AS ENUM ('EMAIL_LINK', 'SIGNED_IN');

-- CreateTable
CREATE TABLE "feedback_forms" (
    "id" UUID NOT NULL,
    "live_session_id" UUID NOT NULL,
    "day_id" UUID,
    "title" VARCHAR(150) NOT NULL,
    "intro" VARCHAR(1000),
    "thank_you_text" VARCHAR(500),
    "status" "FeedbackFormStatus" NOT NULL DEFAULT 'DRAFT',
    "email_mode" "FeedbackEmailMode" NOT NULL DEFAULT 'AUTO_AFTER_DAY',
    "email_delay_minutes" INTEGER NOT NULL DEFAULT 0,
    "allow_anonymous" BOOLEAN NOT NULL DEFAULT false,
    "ask_consent_to_publish" BOOLEAN NOT NULL DEFAULT false,
    "ask_show_name" BOOLEAN NOT NULL DEFAULT false,
    "closes_at" TIMESTAMPTZ(6),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "feedback_forms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback_questions" (
    "id" UUID NOT NULL,
    "form_id" UUID NOT NULL,
    "kind" "FeedbackQuestionKind" NOT NULL,
    "label" VARCHAR(300) NOT NULL,
    "help_text" VARCHAR(500),
    "required" BOOLEAN NOT NULL DEFAULT false,
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "feedback_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback_invites" (
    "id" UUID NOT NULL,
    "form_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "emailed_at" TIMESTAMPTZ(6),
    "email_count" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" VARCHAR(500),
    "claimed_at" TIMESTAMPTZ(6),
    "first_opened_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "feedback_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback_responses" (
    "id" UUID NOT NULL,
    "form_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "source" "FeedbackResponseSource" NOT NULL,
    "is_anonymous" BOOLEAN NOT NULL DEFAULT false,
    "consent_to_publish" BOOLEAN NOT NULL DEFAULT false,
    "show_name" BOOLEAN,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "edited_at" TIMESTAMPTZ(6),

    CONSTRAINT "feedback_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback_answers" (
    "response_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "rating_value" SMALLINT,
    "text_value" TEXT,
    "choice_values" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "feedback_answers_pkey" PRIMARY KEY ("response_id","question_id")
);

-- CreateTable
CREATE TABLE "feedback_highlights" (
    "id" UUID NOT NULL,
    "response_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "quote" VARCHAR(1000) NOT NULL,
    "attribution" VARCHAR(120) NOT NULL,
    "rating" SMALLINT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "feedback_highlights_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feedback_forms_live_session_id_created_at_idx" ON "feedback_forms"("live_session_id", "created_at");

-- CreateIndex
CREATE INDEX "feedback_forms_status_idx" ON "feedback_forms"("status");

-- CreateIndex
CREATE INDEX "feedback_questions_form_id_sort_order_idx" ON "feedback_questions"("form_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "feedback_invites_form_id_user_id_key" ON "feedback_invites"("form_id", "user_id");

-- CreateIndex
CREATE INDEX "feedback_responses_form_id_submitted_at_idx" ON "feedback_responses"("form_id", "submitted_at");

-- CreateIndex
CREATE UNIQUE INDEX "feedback_responses_form_id_user_id_key" ON "feedback_responses"("form_id", "user_id");

-- CreateIndex
CREATE INDEX "feedback_answers_question_id_idx" ON "feedback_answers"("question_id");

-- CreateIndex
CREATE INDEX "feedback_highlights_section_id_sort_order_idx" ON "feedback_highlights"("section_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "feedback_highlights_response_id_section_id_key" ON "feedback_highlights"("response_id", "section_id");

-- AddForeignKey
ALTER TABLE "feedback_forms" ADD CONSTRAINT "feedback_forms_live_session_id_fkey" FOREIGN KEY ("live_session_id") REFERENCES "live_sessions"("product_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_forms" ADD CONSTRAINT "feedback_forms_day_id_fkey" FOREIGN KEY ("day_id") REFERENCES "live_session_days"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_forms" ADD CONSTRAINT "feedback_forms_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_questions" ADD CONSTRAINT "feedback_questions_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "feedback_forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_invites" ADD CONSTRAINT "feedback_invites_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "feedback_forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_invites" ADD CONSTRAINT "feedback_invites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_responses" ADD CONSTRAINT "feedback_responses_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "feedback_forms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_responses" ADD CONSTRAINT "feedback_responses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_answers" ADD CONSTRAINT "feedback_answers_response_id_fkey" FOREIGN KEY ("response_id") REFERENCES "feedback_responses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_answers" ADD CONSTRAINT "feedback_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "feedback_questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_highlights" ADD CONSTRAINT "feedback_highlights_response_id_fkey" FOREIGN KEY ("response_id") REFERENCES "feedback_responses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_highlights" ADD CONSTRAINT "feedback_highlights_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "session_testimonial_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_highlights" ADD CONSTRAINT "feedback_highlights_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Integrity (not modelled by Prisma)

-- Up to a week after the day ends.
ALTER TABLE "feedback_forms" ADD CONSTRAINT "feedback_forms_email_delay_range"
  CHECK ("email_delay_minutes" BETWEEN 0 AND 10080);

ALTER TABLE "feedback_invites" ADD CONSTRAINT "feedback_invites_counts_non_negative"
  CHECK ("email_count" >= 0 AND "attempts" >= 0);

-- RATING is 1-5 and SCALE 0-10; the service checks which applies.
ALTER TABLE "feedback_answers" ADD CONSTRAINT "feedback_answers_rating_range"
  CHECK ("rating_value" IS NULL OR "rating_value" BETWEEN 0 AND 10);

-- A skipped optional question has no row at all, never an empty one.
ALTER TABLE "feedback_answers" ADD CONSTRAINT "feedback_answers_has_value"
  CHECK ("rating_value" IS NOT NULL OR "text_value" IS NOT NULL OR cardinality("choice_values") > 0);

ALTER TABLE "feedback_highlights" ADD CONSTRAINT "feedback_highlights_rating_range"
  CHECK ("rating" IS NULL OR "rating" BETWEEN 1 AND 5);
