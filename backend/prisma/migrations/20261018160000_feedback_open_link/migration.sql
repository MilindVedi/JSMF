-- Feedback replies without signing in, on a form's shared (Telegram) link.
-- Additive: one enum value, one column with a default that keeps today's
-- behaviour, user_id made nullable, two nullable columns, one unique index and
-- two CHECKs. Every existing reply has an account, so it satisfies both CHECKs.

ALTER TYPE "public"."FeedbackResponseSource" ADD VALUE IF NOT EXISTS 'OPEN_LINK';

ALTER TABLE "public"."feedback_forms"
  ADD COLUMN "open_link" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "public"."feedback_responses"
  ALTER COLUMN "user_id" DROP NOT NULL,
  ADD COLUMN "respondent_name" VARCHAR(80),
  ADD COLUMN "edit_key_hash" CHAR(64);

-- Postgres treats NULLs as distinct, so account replies (no key) never collide.
CREATE UNIQUE INDEX "feedback_responses_form_id_edit_key_hash_key"
  ON "public"."feedback_responses"("form_id", "edit_key_hash");

-- A reply without an account must carry a name and an edit key, and cannot be
-- "hidden from the team" (there is no account to hide).
ALTER TABLE "public"."feedback_responses"
  ADD CONSTRAINT "feedback_responses_open_link_has_name_and_key"
  CHECK ("user_id" IS NOT NULL OR ("respondent_name" IS NOT NULL AND "edit_key_hash" IS NOT NULL AND "is_anonymous" = false));

-- A reply with an account takes its name from the account: never both.
ALTER TABLE "public"."feedback_responses"
  ADD CONSTRAINT "feedback_responses_account_has_no_typed_name"
  CHECK ("user_id" IS NULL OR ("respondent_name" IS NULL AND "edit_key_hash" IS NULL));
