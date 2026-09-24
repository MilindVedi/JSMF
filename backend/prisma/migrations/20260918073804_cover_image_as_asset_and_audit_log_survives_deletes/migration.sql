/*
  Warnings:

  - You are about to drop the column `cover_image_url` on the `products` table. All the data in the column will be lost.

*/
-- AlterEnum
ALTER TYPE "AssetKind" ADD VALUE 'COVER_IMAGE';

-- DropForeignKey
ALTER TABLE "content_access_events" DROP CONSTRAINT "content_access_events_asset_id_fkey";

-- DropForeignKey
ALTER TABLE "content_access_events" DROP CONSTRAINT "content_access_events_product_id_fkey";

-- AlterTable
ALTER TABLE "content_access_events" ALTER COLUMN "product_id" DROP NOT NULL,
ALTER COLUMN "asset_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "products" DROP COLUMN "cover_image_url";

-- AddForeignKey
ALTER TABLE "content_access_events" ADD CONSTRAINT "content_access_events_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_access_events" ADD CONSTRAINT "content_access_events_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "product_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
