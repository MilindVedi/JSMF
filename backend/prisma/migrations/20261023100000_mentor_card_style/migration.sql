-- Dr. Angad's portrait in the site heroes.
--
-- mentor_card_style: the arched poster with floating rank medals (POSTER, the
-- new look) or the framed photo with a credential card (CARD, how it looked
-- before). Site-wide, set in the admin.
--
-- mentor_photo_*: a photo the admin uploaded for it, in the public bucket.
-- All null = the photo bundled with the websites, as today.
--
-- Additive: a new type and four columns, all defaulted or nullable, so the
-- previous app version is unaffected.
CREATE TYPE "MentorCardStyle" AS ENUM ('POSTER', 'CARD');

ALTER TABLE "platform_settings"
  ADD COLUMN "mentor_card_style" "MentorCardStyle" NOT NULL DEFAULT 'POSTER',
  ADD COLUMN "mentor_photo_storage_provider" "StorageProvider",
  ADD COLUMN "mentor_photo_bucket" VARCHAR(255),
  ADD COLUMN "mentor_photo_object_key" TEXT;
