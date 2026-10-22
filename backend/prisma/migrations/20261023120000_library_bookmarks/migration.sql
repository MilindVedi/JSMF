-- Bookmarks in the reader's library (pdf-web /library, "Bookmarked").
-- One row per reader and product. Additive: a new table only, so the previous
-- app version, which never reads it, is unaffected.
CREATE TABLE "library_bookmarks" (
  "user_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "library_bookmarks_pkey" PRIMARY KEY ("user_id", "product_id")
);

CREATE INDEX "library_bookmarks_product_id_idx" ON "library_bookmarks"("product_id");

ALTER TABLE "library_bookmarks"
  ADD CONSTRAINT "library_bookmarks_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "library_bookmarks"
  ADD CONSTRAINT "library_bookmarks_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
