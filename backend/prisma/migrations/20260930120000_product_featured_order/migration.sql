-- Position in the storefront's featured strip, NULL for everything else.
--
-- One nullable column rather than a `featured` boolean plus a position: two
-- columns would permit "featured, no position", a state with no meaning that
-- every reader would then have to handle.
ALTER TABLE "products" ADD COLUMN "featured_order" INTEGER;

CREATE INDEX "products_featured_order_idx" ON "products" ("featured_order");
