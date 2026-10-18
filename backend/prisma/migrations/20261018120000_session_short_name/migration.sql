-- A stable short name for a live session, used in emails and the library
-- instead of the product title (which the booking card shows and admins reword
-- day to day).
--
-- Additive only: one nullable column. NULL means "use the title", so every
-- existing session sends exactly the emails it sends today.

-- AlterTable
ALTER TABLE "live_sessions" ADD COLUMN "short_name" VARCHAR(120);
