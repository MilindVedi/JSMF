-- Testimonials shown on the home page while no session is upcoming.
-- Additive only: four new columns on the singleton settings row, all with
-- defaults or nullable, so the previous app version keeps working unchanged.
ALTER TABLE "platform_settings"
  ADD COLUMN "no_session_testimonials_enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "no_session_testimonials_session_id" UUID,
  ADD COLUMN "no_session_testimonials_heading" VARCHAR(150),
  ADD COLUMN "no_session_testimonials_subheading" VARCHAR(300);

ALTER TABLE "platform_settings"
  ADD CONSTRAINT "platform_settings_no_session_testimonials_session_id_fkey"
  FOREIGN KEY ("no_session_testimonials_session_id") REFERENCES "live_sessions"("product_id")
  ON DELETE SET NULL ON UPDATE CASCADE;
