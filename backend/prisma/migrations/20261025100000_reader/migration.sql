-- The in-browser reader: reading position, view vs download in the access log,
-- the store-wide and per-product download switch, and samples cut from the
-- first N pages. Additive only: every existing row keeps today's behaviour
-- (downloads on, events recorded as DOWNLOAD).

-- CreateEnum
CREATE TYPE "ContentAccessPurpose" AS ENUM ('DOWNLOAD', 'READ', 'SAMPLE');

-- CreateEnum
CREATE TYPE "DownloadPolicy" AS ENUM ('INHERIT', 'ALLOWED', 'BLOCKED');

-- AlterTable
ALTER TABLE "content_access_events" ADD COLUMN     "purpose" "ContentAccessPurpose" NOT NULL DEFAULT 'DOWNLOAD';

-- AlterTable
ALTER TABLE "platform_settings" ADD COLUMN     "downloads_enabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "product_assets" ADD COLUMN     "derived_from_asset_id" UUID;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "download_policy" "DownloadPolicy" NOT NULL DEFAULT 'INHERIT',
ADD COLUMN     "sample_page_count" INTEGER;

-- CreateTable
CREATE TABLE "reading_progress" (
    "user_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "asset_id" UUID,
    "page" INTEGER NOT NULL,
    "page_count" INTEGER NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "reading_progress_pkey" PRIMARY KEY ("user_id","product_id")
);

-- CreateIndex
CREATE INDEX "reading_progress_user_id_updated_at_idx" ON "reading_progress"("user_id", "updated_at" DESC);

-- AddForeignKey
ALTER TABLE "product_assets" ADD CONSTRAINT "product_assets_derived_from_asset_id_fkey" FOREIGN KEY ("derived_from_asset_id") REFERENCES "product_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reading_progress" ADD CONSTRAINT "reading_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reading_progress" ADD CONSTRAINT "reading_progress_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reading_progress" ADD CONSTRAINT "reading_progress_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "product_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

