-- The "Med Prep" header link on the main website and the PDF store, and its
-- "New" badge, each with its own switch under Admin -> Settings.
--
-- Additive and backward compatible: two nullable-free booleans with defaults,
-- so the existing row and any older build of the app are unaffected (an older
-- build simply never reads them).
ALTER TABLE "platform_settings"
  ADD COLUMN "med_prep_link_enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "med_prep_link_highlight" BOOLEAN NOT NULL DEFAULT true;
