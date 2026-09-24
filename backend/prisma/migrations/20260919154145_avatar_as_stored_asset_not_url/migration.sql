/*
  Warnings:

  - You are about to drop the column `avatar_url` on the `publisher_profiles` table. All the data in the column will be lost.
  - You are about to drop the column `avatar_url` on the `users` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "publisher_profiles" DROP COLUMN "avatar_url",
ADD COLUMN     "avatar_object_key" TEXT,
ADD COLUMN     "avatar_storage_provider" "StorageProvider";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "avatar_url",
ADD COLUMN     "avatar_object_key" TEXT,
ADD COLUMN     "avatar_storage_provider" "StorageProvider";
