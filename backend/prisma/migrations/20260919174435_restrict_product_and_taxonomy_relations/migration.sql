-- DropForeignKey
ALTER TABLE "product_assets" DROP CONSTRAINT "product_assets_product_id_fkey";

-- DropForeignKey
ALTER TABLE "product_links" DROP CONSTRAINT "product_links_product_id_fkey";

-- DropForeignKey
ALTER TABLE "product_taxonomy_terms" DROP CONSTRAINT "product_taxonomy_terms_term_id_fkey";

-- DropForeignKey
ALTER TABLE "taxonomy_terms" DROP CONSTRAINT "taxonomy_terms_taxonomy_id_fkey";

-- AddForeignKey
ALTER TABLE "product_assets" ADD CONSTRAINT "product_assets_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_links" ADD CONSTRAINT "product_links_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taxonomy_terms" ADD CONSTRAINT "taxonomy_terms_taxonomy_id_fkey" FOREIGN KEY ("taxonomy_id") REFERENCES "taxonomies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_taxonomy_terms" ADD CONSTRAINT "product_taxonomy_terms_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "taxonomy_terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
