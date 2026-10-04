-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "pyq";

-- CreateEnum
CREATE TYPE "pyq"."Difficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "pyq"."QuestionStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "pyq"."PracticeMode" AS ENUM ('PRACTICE', 'TEST', 'CUSTOM');

-- CreateEnum
CREATE TYPE "pyq"."PracticeSessionStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED');

-- CreateEnum
CREATE TYPE "pyq"."QuestionReportReason" AS ENUM ('WRONG_ANSWER', 'WRONG_EXPLANATION', 'INCORRECT_QUESTION', 'IMAGE_ISSUE', 'OTHER');

-- CreateEnum
CREATE TYPE "pyq"."QuestionReportStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- CreateTable
CREATE TABLE "pyq"."exams" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(60) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "short_name" VARCHAR(40) NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pyq"."subjects" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "group" VARCHAR(40) NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pyq"."topics" (
    "id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pyq"."questions" (
    "id" UUID NOT NULL,
    "external_key" VARCHAR(160) NOT NULL,
    "exam_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "topic_id" UUID,
    "year" SMALLINT NOT NULL,
    "stem" TEXT NOT NULL,
    "stem_image_url" TEXT,
    "stem_figure" JSONB,
    "explanation" TEXT NOT NULL,
    "explanation_image_url" TEXT,
    "explanation_figure" JSONB,
    "difficulty" "pyq"."Difficulty" NOT NULL DEFAULT 'MEDIUM',
    "status" "pyq"."QuestionStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pyq"."question_options" (
    "id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "label" VARCHAR(4) NOT NULL,
    "text" TEXT NOT NULL,
    "image_url" TEXT,
    "is_correct" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "question_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pyq"."practice_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "mode" "pyq"."PracticeMode" NOT NULL,
    "label" VARCHAR(200) NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "time_limit_sec" INTEGER,
    "status" "pyq"."PracticeSessionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMPTZ(6),
    "total_questions" INTEGER NOT NULL,
    "correct_count" INTEGER,
    "incorrect_count" INTEGER,
    "unattempted_count" INTEGER,
    "accuracy" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "practice_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pyq"."session_questions" (
    "session_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "session_questions_pkey" PRIMARY KEY ("session_id","question_id")
);

-- CreateTable
CREATE TABLE "pyq"."attempts" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "selected_option_id" UUID,
    "is_correct" BOOLEAN,
    "time_spent_ms" INTEGER NOT NULL DEFAULT 0,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "answered_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pyq"."bookmarks" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bookmarks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pyq"."question_reports" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "reason" "pyq"."QuestionReportReason" NOT NULL,
    "details" VARCHAR(2000),
    "status" "pyq"."QuestionReportStatus" NOT NULL DEFAULT 'OPEN',
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "question_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "exams_slug_key" ON "pyq"."exams"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_slug_key" ON "pyq"."subjects"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "topics_slug_key" ON "pyq"."topics"("slug");

-- CreateIndex
CREATE INDEX "topics_subject_id_idx" ON "pyq"."topics"("subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "questions_external_key_key" ON "pyq"."questions"("external_key");

-- CreateIndex
CREATE INDEX "questions_status_subject_id_topic_id_idx" ON "pyq"."questions"("status", "subject_id", "topic_id");

-- CreateIndex
CREATE INDEX "questions_status_exam_id_year_idx" ON "pyq"."questions"("status", "exam_id", "year");

-- CreateIndex
CREATE INDEX "questions_status_difficulty_idx" ON "pyq"."questions"("status", "difficulty");

-- CreateIndex
CREATE UNIQUE INDEX "question_options_question_id_sort_order_key" ON "pyq"."question_options"("question_id", "sort_order");

-- CreateIndex
CREATE INDEX "practice_sessions_user_id_started_at_idx" ON "pyq"."practice_sessions"("user_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "session_questions_question_id_idx" ON "pyq"."session_questions"("question_id");

-- CreateIndex
CREATE UNIQUE INDEX "session_questions_session_id_position_key" ON "pyq"."session_questions"("session_id", "position");

-- CreateIndex
CREATE INDEX "attempts_user_id_answered_at_idx" ON "pyq"."attempts"("user_id", "answered_at");

-- CreateIndex
CREATE INDEX "attempts_user_id_question_id_answered_at_idx" ON "pyq"."attempts"("user_id", "question_id", "answered_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "attempts_session_id_question_id_key" ON "pyq"."attempts"("session_id", "question_id");

-- CreateIndex
CREATE INDEX "bookmarks_user_id_created_at_idx" ON "pyq"."bookmarks"("user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "bookmarks_user_id_question_id_key" ON "pyq"."bookmarks"("user_id", "question_id");

-- CreateIndex
CREATE INDEX "question_reports_status_created_at_idx" ON "pyq"."question_reports"("status", "created_at");

-- CreateIndex
CREATE INDEX "question_reports_question_id_idx" ON "pyq"."question_reports"("question_id");

-- AddForeignKey
ALTER TABLE "pyq"."topics" ADD CONSTRAINT "topics_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "pyq"."subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pyq"."questions" ADD CONSTRAINT "questions_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "pyq"."exams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pyq"."questions" ADD CONSTRAINT "questions_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "pyq"."subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pyq"."questions" ADD CONSTRAINT "questions_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "pyq"."topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pyq"."question_options" ADD CONSTRAINT "question_options_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "pyq"."questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pyq"."practice_sessions" ADD CONSTRAINT "practice_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pyq"."session_questions" ADD CONSTRAINT "session_questions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "pyq"."practice_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pyq"."session_questions" ADD CONSTRAINT "session_questions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "pyq"."questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pyq"."attempts" ADD CONSTRAINT "attempts_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "pyq"."practice_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pyq"."attempts" ADD CONSTRAINT "attempts_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "pyq"."questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pyq"."attempts" ADD CONSTRAINT "attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pyq"."bookmarks" ADD CONSTRAINT "bookmarks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pyq"."bookmarks" ADD CONSTRAINT "bookmarks_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "pyq"."questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pyq"."question_reports" ADD CONSTRAINT "question_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pyq"."question_reports" ADD CONSTRAINT "question_reports_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "pyq"."questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
