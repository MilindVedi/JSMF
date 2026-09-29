-- Mobile-number accounts: an account may exist with a phone and no email.

-- AlterEnum (additive; no existing row changes)
ALTER TYPE "VerificationPurpose" ADD VALUE 'PHONE_SIGN_IN';
ALTER TYPE "VerificationPurpose" ADD VALUE 'PHONE_REGISTRATION';
ALTER TYPE "VerificationPurpose" ADD VALUE 'PHONE_LINK';

-- AlterTable: email becomes optional. Existing rows all have one, so nothing
-- is lost; the unique index is kept and still applies to every non-null email.
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "users" ADD COLUMN "phone_verified_at" TIMESTAMPTZ(6);

-- AlterTable: an order from a mobile-only buyer has no email to record.
ALTER TABLE "orders" ALTER COLUMN "customer_email" DROP NOT NULL;
