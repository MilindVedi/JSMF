-- A single-row table of site-wide toggles. Seeded with its one row so the
-- app can always read it without a "does it exist yet" check.
CREATE TABLE "platform_settings" (
  "id" VARCHAR(20) NOT NULL DEFAULT 'global',
  "show_spam_folder_note" BOOLEAN NOT NULL DEFAULT true,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "platform_settings" ("id", "show_spam_folder_note", "updated_at")
VALUES ('global', true, CURRENT_TIMESTAMP);
