-- CreateEnum
CREATE TYPE "EmailDeliveryStatus" AS ENUM ('SENT', 'FAILED', 'QUOTA_EXCEEDED');

-- CreateTable
CREATE TABLE "email_deliveries" (
    "id" UUID NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "tag" VARCHAR(64),
    "recipient" VARCHAR(255) NOT NULL,
    "status" "EmailDeliveryStatus" NOT NULL,
    "provider_message_id" VARCHAR(255),
    "error" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_deliveries_created_at_status_idx" ON "email_deliveries"("created_at", "status");
