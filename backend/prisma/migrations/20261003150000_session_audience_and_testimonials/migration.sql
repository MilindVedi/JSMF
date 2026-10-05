-- Two things a session page needs to say for itself, both edited in the admin
-- dashboard rather than deployed:
--
--   * "Who is this session for?" — one paragraph naming the exams it suits.
--   * Testimonials — screenshots of what people said about a past session.
--
-- Testimonials get their own table rather than `product_assets` rows, because
-- that table's current-asset index allows one asset per kind and this is a
-- gallery: many at once, ordered, each removable on its own.

ALTER TABLE "live_sessions" ADD COLUMN "audience_text" VARCHAR(600);

CREATE TABLE "session_testimonials" (
  "id" UUID NOT NULL,
  "live_session_id" UUID NOT NULL,
  "storage_provider" "StorageProvider" NOT NULL,
  "bucket" VARCHAR(255) NOT NULL,
  "object_key" TEXT NOT NULL,
  "mime_type" VARCHAR(120),
  "size_bytes" BIGINT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "uploaded_by" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "session_testimonials_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "session_testimonials_live_session_id_sort_order_idx"
  ON "session_testimonials" ("live_session_id", "sort_order");

-- Cascade: unlike a sold product, a testimonial is marketing with no record to
-- preserve — if the session row goes, so should its screenshots.
ALTER TABLE "session_testimonials"
  ADD CONSTRAINT "session_testimonials_live_session_id_fkey"
  FOREIGN KEY ("live_session_id") REFERENCES "live_sessions"("product_id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "session_testimonials"
  ADD CONSTRAINT "session_testimonials_uploaded_by_fkey"
  FOREIGN KEY ("uploaded_by") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
