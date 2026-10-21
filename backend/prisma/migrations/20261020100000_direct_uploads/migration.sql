-- Direct-to-storage uploads: a browser sends a file straight to object
-- storage, and this table tracks each one from "session handed out" to
-- "recorded by its purpose" (or abandoned and cleaned up). One table for every
-- kind of upload — product files, session screenshots, later user files —
-- told apart by `purpose`.
--
-- Additive only. A new enum, a new table, and one nullable column on
-- product_assets. The previous app version neither reads nor writes any of
-- them, so rolling the app back needs no database rollback.

CREATE TYPE "UploadStatus" AS ENUM ('PENDING', 'COMPLETED', 'ABORTED', 'EXPIRED');

ALTER TABLE "product_assets" ADD COLUMN "checksum_md5" VARCHAR(32);

CREATE TABLE "uploads" (
    "id" UUID NOT NULL,
    "purpose" VARCHAR(60) NOT NULL,
    "target_id" UUID,
    "context" JSONB,
    "storage_provider" "StorageProvider" NOT NULL,
    "bucket" VARCHAR(255) NOT NULL,
    "object_key" TEXT NOT NULL,
    "staged" BOOLEAN NOT NULL DEFAULT false,
    "original_filename" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(120) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "status" "UploadStatus" NOT NULL DEFAULT 'PENDING',
    "failure_reason" VARCHAR(300),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),
    "result_id" UUID,

    CONSTRAINT "uploads_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "uploads_size_positive" CHECK ("size_bytes" > 0)
);

CREATE UNIQUE INDEX "uploads_storage_provider_bucket_object_key_key"
    ON "uploads"("storage_provider", "bucket", "object_key");
CREATE INDEX "uploads_status_expires_at_idx" ON "uploads"("status", "expires_at");
CREATE INDEX "uploads_created_by_status_idx" ON "uploads"("created_by", "status");
CREATE INDEX "uploads_purpose_target_id_idx" ON "uploads"("purpose", "target_id");

ALTER TABLE "uploads" ADD CONSTRAINT "uploads_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
