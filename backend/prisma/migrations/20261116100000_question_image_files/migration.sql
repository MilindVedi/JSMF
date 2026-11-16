-- A question image uploaded through the admin editor is a stored file, not a
-- link: it lives in the PRIVATE bucket and is shown through a short-lived
-- signed link made when the question is sent, so the images students pay for
-- cannot be opened, listed or shared by anyone outside the app.
--
-- Addressed like every other stored file (provider + bucket + object key),
-- all three null together. Additive and nullable: the existing
-- `stem_image_url` / `explanation_image_url` columns stay as they are (a
-- pasted link still works), and the previous app version ignores these.
ALTER TABLE "pyq"."questions"
    ADD COLUMN "stem_image_storage_provider" "public"."StorageProvider",
    ADD COLUMN "stem_image_bucket" VARCHAR(255),
    ADD COLUMN "stem_image_object_key" TEXT,
    ADD COLUMN "explanation_image_storage_provider" "public"."StorageProvider",
    ADD COLUMN "explanation_image_bucket" VARCHAR(255),
    ADD COLUMN "explanation_image_object_key" TEXT,
    ADD CONSTRAINT "questions_stem_image_file_complete"
        CHECK (num_nulls("stem_image_storage_provider", "stem_image_bucket", "stem_image_object_key") IN (0, 3)),
    ADD CONSTRAINT "questions_explanation_image_file_complete"
        CHECK (num_nulls("explanation_image_storage_provider", "explanation_image_bucket", "explanation_image_object_key") IN (0, 3));
