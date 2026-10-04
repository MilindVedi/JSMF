-- Profile answers collected once after email signup. Additive and nullable:
-- every existing account simply has no profile yet.
ALTER TABLE "users"
  ADD COLUMN "contact_phone" VARCHAR(20),
  ADD COLUMN "preparing_for" VARCHAR(40),
  ADD COLUMN "current_stage" VARCHAR(40),
  ADD COLUMN "profile_completed_at" TIMESTAMPTZ(6);
