-- Admin accounts are now created by invitation from an existing admin, not by
-- a public request that emailed a one-time code to the owner. The two purposes
-- that supported that flow are replaced by a single ADMIN_INVITATION.
--
-- PostgreSQL cannot drop a value from an enum in place, so the type is rebuilt
-- and swapped. Any rows still carrying the retired purposes are pending
-- approvals from the old flow, which no longer has an endpoint that could
-- complete them — they are deleted rather than migrated, because an invitation
-- must be addressed to a specific invitee and those rows have no invitee.
DELETE FROM "verification_codes"
WHERE "purpose"::text IN ('ADMIN_REGISTRATION', 'ADMIN_REGISTRATION_GRANT');

ALTER TYPE "VerificationPurpose" RENAME TO "VerificationPurpose_old";

CREATE TYPE "VerificationPurpose" AS ENUM (
  'ADMIN_INVITATION',
  'OAUTH_HANDOFF',
  'EMAIL_VERIFICATION',
  'PASSWORD_RESET'
);

ALTER TABLE "verification_codes"
  ALTER COLUMN "purpose" TYPE "VerificationPurpose"
  USING ("purpose"::text::"VerificationPurpose");

DROP TYPE "VerificationPurpose_old";
