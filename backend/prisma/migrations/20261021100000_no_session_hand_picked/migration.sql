-- Hand-picked testimonials for the home page while no session is upcoming:
-- screenshots and feedback replies chosen one by one, from any sessions.
-- Additive only: one new column with a default (off, so the band behaves as
-- before until an admin switches over) and two new tables. The previous app
-- version never reads them.
ALTER TABLE "platform_settings"
  ADD COLUMN "no_session_testimonials_hand_picked" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "no_session_screenshots" (
  "testimonial_id" UUID NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "no_session_screenshots_pkey" PRIMARY KEY ("testimonial_id")
);
CREATE INDEX "no_session_screenshots_sort_order_idx" ON "no_session_screenshots"("sort_order");
ALTER TABLE "no_session_screenshots"
  ADD CONSTRAINT "no_session_screenshots_testimonial_id_fkey"
  FOREIGN KEY ("testimonial_id") REFERENCES "session_testimonials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "no_session_quotes" (
  "id" UUID NOT NULL,
  "response_id" UUID NOT NULL,
  "quote" VARCHAR(1000) NOT NULL,
  "attribution" VARCHAR(120) NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_by_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "no_session_quotes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "no_session_quotes_response_id_key" ON "no_session_quotes"("response_id");
CREATE INDEX "no_session_quotes_sort_order_idx" ON "no_session_quotes"("sort_order");
ALTER TABLE "no_session_quotes"
  ADD CONSTRAINT "no_session_quotes_response_id_fkey"
  FOREIGN KEY ("response_id") REFERENCES "feedback_responses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "no_session_quotes"
  ADD CONSTRAINT "no_session_quotes_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
