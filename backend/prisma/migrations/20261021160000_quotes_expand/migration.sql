-- What "Read more" on a long reply does on the website: open it in a pop-up
-- (POPUP, what the site does today) or grow the card in place (INLINE, how it
-- worked before). Site-wide, set in the admin. Additive: a new type and one
-- column with a default, so the previous app version is unaffected.
CREATE TYPE "QuoteExpand" AS ENUM ('POPUP', 'INLINE');

ALTER TABLE "platform_settings"
  ADD COLUMN "feedback_quotes_expand" "QuoteExpand" NOT NULL DEFAULT 'POPUP';
