-- How the written replies are laid out on the website: one row that scrolls
-- sideways (SCROLL, what the site does today) or a block that wraps onto
-- several lines (GRID, how it looked before). Site-wide, set in the admin.
-- Additive: a new type and one column with a default, so the previous app
-- version is unaffected.
CREATE TYPE "QuoteLayout" AS ENUM ('SCROLL', 'GRID');

ALTER TABLE "platform_settings"
  ADD COLUMN "feedback_quotes_layout" "QuoteLayout" NOT NULL DEFAULT 'SCROLL';
