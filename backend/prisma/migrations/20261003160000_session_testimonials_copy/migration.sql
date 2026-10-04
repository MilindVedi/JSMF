-- Optional per-session copy around the testimonials section. All three are
-- nullable; the app falls back to generic text when they are not set.
ALTER TABLE "live_sessions"
  ADD COLUMN "testimonials_heading" VARCHAR(150),
  ADD COLUMN "testimonials_subheading" VARCHAR(300),
  ADD COLUMN "testimonials_tag" VARCHAR(80);
