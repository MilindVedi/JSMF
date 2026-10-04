-- CreateTable
CREATE TABLE "pyq"."collections" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pyq"."collection_questions" (
    "collection_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "added_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collection_questions_pkey" PRIMARY KEY ("collection_id","question_id")
);

-- CreateTable
CREATE TABLE "pyq"."user_preferences" (
    "user_id" UUID NOT NULL,
    "target_exam" VARCHAR(60),
    "daily_target" SMALLINT NOT NULL DEFAULT 10,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE INDEX "collections_user_id_created_at_idx" ON "pyq"."collections"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "collection_questions_question_id_idx" ON "pyq"."collection_questions"("question_id");

-- AddForeignKey
ALTER TABLE "pyq"."collections" ADD CONSTRAINT "collections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pyq"."collection_questions" ADD CONSTRAINT "collection_questions_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "pyq"."collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pyq"."collection_questions" ADD CONSTRAINT "collection_questions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "pyq"."questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pyq"."user_preferences" ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
