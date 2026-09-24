-- DropIndex
DROP INDEX "taxonomy_terms_taxonomy_id_slug_key";

-- AlterTable
ALTER TABLE "product_links" ADD COLUMN     "deleted_at" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "taxonomy_terms" ADD COLUMN     "deleted_at" TIMESTAMPTZ(6);

-- ---------------------------------------------------------------------------
-- Replaces the plain UNIQUE(taxonomy_id, slug) dropped above with a PARTIAL
-- unique index scoped to live rows. Prisma's schema language cannot express
-- this, so it is hand-written here, the same pattern as
-- entitlements_user_product_active_unique.
--
-- Without the WHERE clause, soft-deleting "pathology" and creating a new term
-- with the same slug would be rejected by the plain unique index forever —
-- the old row still exists, it is just hidden. The partial index is what
-- makes a freed-up slug actually reusable, which is the entire point of a
-- soft delete being reversible rather than a delete with extra steps.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "taxonomy_terms_taxonomy_id_slug_active_unique"
  ON "taxonomy_terms" ("taxonomy_id", "slug")
  WHERE "deleted_at" IS NULL;
