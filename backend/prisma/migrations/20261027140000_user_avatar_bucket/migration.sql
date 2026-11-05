-- The avatar columns on `users` were added ahead of the feature and were
-- missing the bucket every other stored-file row carries, so the pair could
-- not be turned into an ObjectRef. Additive and nullable: existing rows have
-- no avatar, and all three columns stay null together until one is set.
ALTER TABLE "users"
    ADD COLUMN "avatar_bucket" VARCHAR(255);
