-- Named testimonial sections (e.g. "Day 1 feedback") beside a session's
-- original testimonials.
--
-- Additive only: a new table, and a nullable section_id on
-- session_testimonials. Every existing testimonial keeps section_id NULL, which
-- means the original gallery, so the website shows exactly what it does today.

-- AlterTable
ALTER TABLE "session_testimonials" ADD COLUMN     "section_id" UUID;

-- CreateTable
CREATE TABLE "session_testimonial_sections" (
    "id" UUID NOT NULL,
    "live_session_id" UUID NOT NULL,
    "day_id" UUID,
    "heading" VARCHAR(150) NOT NULL,
    "subheading" VARCHAR(300),
    "tag" VARCHAR(80),
    "is_visible" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "session_testimonial_sections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "session_testimonial_sections_live_session_id_sort_order_idx" ON "session_testimonial_sections"("live_session_id", "sort_order");

-- CreateIndex
CREATE INDEX "session_testimonials_section_id_sort_order_idx" ON "session_testimonials"("section_id", "sort_order");

-- AddForeignKey
ALTER TABLE "session_testimonials" ADD CONSTRAINT "session_testimonials_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "session_testimonial_sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_testimonial_sections" ADD CONSTRAINT "session_testimonial_sections_live_session_id_fkey" FOREIGN KEY ("live_session_id") REFERENCES "live_sessions"("product_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_testimonial_sections" ADD CONSTRAINT "session_testimonial_sections_day_id_fkey" FOREIGN KEY ("day_id") REFERENCES "live_session_days"("id") ON DELETE SET NULL ON UPDATE CASCADE;

