-- Offline sales: purchases whose money arrived outside checkout (direct UPI,
-- Razorpay Payment Page, bank transfer, cash), recorded by an admin. Additive:
-- two new enums, one new PaymentProvider value, one new table.

-- CreateEnum
CREATE TYPE "OfflinePaymentMethod" AS ENUM ('RAZORPAY_PAYMENT_PAGE', 'UPI_DIRECT', 'BANK_TRANSFER', 'CASH', 'OTHER');

-- CreateEnum
CREATE TYPE "OfflineSaleEntry" AS ENUM ('FORM', 'FILE', 'SCRIPT');

-- AlterEnum
ALTER TYPE "PaymentProvider" ADD VALUE 'OFFLINE';

-- CreateTable
CREATE TABLE "offline_sales" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "method" "OfflinePaymentMethod" NOT NULL,
    "reference" VARCHAR(100),
    "note" VARCHAR(500),
    "paid_at" TIMESTAMPTZ(6) NOT NULL,
    "entry" "OfflineSaleEntry" NOT NULL,
    "recorded_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offline_sales_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "offline_sales_order_id_key" ON "offline_sales"("order_id");

-- CreateIndex
CREATE INDEX "offline_sales_product_id_paid_at_idx" ON "offline_sales"("product_id", "paid_at");

-- AddForeignKey
ALTER TABLE "offline_sales" ADD CONSTRAINT "offline_sales_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offline_sales" ADD CONSTRAINT "offline_sales_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offline_sales" ADD CONSTRAINT "offline_sales_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offline_sales" ADD CONSTRAINT "offline_sales_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Buyers already brought in by prisma/backfill-session-buyers.ts, before this
-- table existed, are recognised by the `backfill` key the script wrote into the
-- order's notes. Copied so they appear in the admin's list of buyers added by
-- hand. Re-running is harmless: ON CONFLICT skips orders already copied.
INSERT INTO "offline_sales" ("id", "order_id", "product_id", "user_id", "method", "reference", "paid_at", "entry", "created_at")
SELECT
  gen_random_uuid(),
  o."id",
  (SELECT oi."product_id" FROM "order_items" oi WHERE oi."order_id" = o."id" ORDER BY oi."id" LIMIT 1),
  o."user_id",
  CASE o."notes"->>'backfill'
    WHEN 'upi-direct' THEN 'UPI_DIRECT'::"OfflinePaymentMethod"
    ELSE 'RAZORPAY_PAYMENT_PAGE'::"OfflinePaymentMethod"
  END,
  NULLIF(o."notes"->>'razorpayPaymentId', ''),
  COALESCE(o."paid_at", o."created_at"),
  'SCRIPT'::"OfflineSaleEntry",
  COALESCE(o."paid_at", o."created_at")
FROM "orders" o
WHERE o."notes" ? 'backfill'
  AND EXISTS (SELECT 1 FROM "order_items" oi WHERE oi."order_id" = o."id")
ON CONFLICT ("order_id") DO NOTHING;
