-- Per-day session materials, and a "Show in store" switch for products.
--
-- Additive only:
--   * products.listed defaults to true, so every existing product stays in the
--     store exactly as today.
--   * live_sessions.late_joiners_get_earlier_materials defaults to true.
--   * a new EntitlementSource value, used only by the new tables' code.
--   * two new tables.
-- Nothing existing is altered or removed, so the previous app version runs
-- against this schema unchanged.

-- AlterEnum
ALTER TYPE "EntitlementSource" ADD VALUE 'SESSION_MATERIAL';

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "listed" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "live_sessions" ADD COLUMN     "late_joiners_get_earlier_materials" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "session_materials" (
    "id" UUID NOT NULL,
    "live_session_id" UUID NOT NULL,
    "day_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "added_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_material_notices" (
    "material_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "sent_at" TIMESTAMPTZ(6),
    "last_error" VARCHAR(500),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "session_material_notices_pkey" PRIMARY KEY ("material_id","user_id")
);

-- CreateIndex
CREATE INDEX "session_materials_live_session_id_idx" ON "session_materials"("live_session_id");

-- CreateIndex
CREATE INDEX "session_materials_product_id_idx" ON "session_materials"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "session_materials_day_id_product_id_key" ON "session_materials"("day_id", "product_id");

-- AddForeignKey
ALTER TABLE "session_materials" ADD CONSTRAINT "session_materials_live_session_id_fkey" FOREIGN KEY ("live_session_id") REFERENCES "live_sessions"("product_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_materials" ADD CONSTRAINT "session_materials_day_id_fkey" FOREIGN KEY ("day_id") REFERENCES "live_session_days"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_materials" ADD CONSTRAINT "session_materials_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_materials" ADD CONSTRAINT "session_materials_added_by_id_fkey" FOREIGN KEY ("added_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_material_notices" ADD CONSTRAINT "session_material_notices_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "session_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_material_notices" ADD CONSTRAINT "session_material_notices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

