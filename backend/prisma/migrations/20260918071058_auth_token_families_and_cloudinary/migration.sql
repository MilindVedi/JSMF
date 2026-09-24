/*
  Warnings:

  - Added the required column `token_family_id` to the `refresh_tokens` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "RefreshTokenRevokedReason" AS ENUM ('ROTATED', 'REUSE_DETECTED', 'LOGOUT', 'ADMIN_REVOKED');

-- AlterEnum
ALTER TYPE "StorageProvider" ADD VALUE 'CLOUDINARY';

-- AlterTable
ALTER TABLE "product_assets" ALTER COLUMN "storage_provider" DROP DEFAULT;

-- AlterTable
ALTER TABLE "refresh_tokens" ADD COLUMN     "revoked_reason" "RefreshTokenRevokedReason",
ADD COLUMN     "token_family_id" UUID NOT NULL;

-- CreateIndex
CREATE INDEX "refresh_tokens_token_family_id_idx" ON "refresh_tokens"("token_family_id");

-- ---------------------------------------------------------------------------
-- Revocation coherence, matching the same rule already applied to entitlements:
-- a revoked token must say when and why, and a live token must claim neither.
--
-- This matters more than it looks. Reuse detection decides whether a presented
-- token is a legitimate rotation or a replay by reading revoked_reason. A row
-- that is revoked but has no reason would be indistinguishable from a live one
-- to that logic, which is precisely the case an attacker benefits from.
-- ---------------------------------------------------------------------------
ALTER TABLE "refresh_tokens"
  ADD CONSTRAINT "refresh_tokens_revocation_is_coherent"
  CHECK (
    ("revoked_at" IS NULL AND "revoked_reason" IS NULL)
    OR
    ("revoked_at" IS NOT NULL AND "revoked_reason" IS NOT NULL)
  );
