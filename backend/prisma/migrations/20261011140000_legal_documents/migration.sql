-- CreateEnum
CREATE TYPE "LegalDocumentType" AS ENUM ('TERMS', 'PRIVACY', 'REFUND');

-- CreateEnum
CREATE TYPE "LegalVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "LegalChangeKind" AS ENUM ('MAJOR', 'MINOR');

-- CreateEnum
CREATE TYPE "LegalAcceptanceKind" AS ENUM ('ACCEPTED', 'ACKNOWLEDGED');

-- CreateEnum
CREATE TYPE "LegalAcceptanceContext" AS ENUM ('SIGNUP', 'RE_ACCEPT', 'CHECKOUT');

-- CreateEnum
CREATE TYPE "JsmfApp" AS ENUM ('MAIN', 'PYQ', 'STORE');

-- CreateTable
CREATE TABLE "legal_document_versions" (
    "id" UUID NOT NULL,
    "type" "LegalDocumentType" NOT NULL,
    "version" VARCHAR(16),
    "status" "LegalVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "title" VARCHAR(200) NOT NULL,
    "sections" JSONB NOT NULL,
    "content_hash" CHAR(64),
    "change_kind" "LegalChangeKind",
    "change_summary" VARCHAR(2000),
    "effective_at" TIMESTAMPTZ(6),
    "based_on_version_id" UUID,
    "created_by_id" UUID,
    "published_by_id" UUID,
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "legal_document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_acceptances" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "kind" "LegalAcceptanceKind" NOT NULL,
    "context" "LegalAcceptanceContext" NOT NULL,
    "app" "JsmfApp" NOT NULL,
    "order_id" UUID,
    "accepted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" VARCHAR(45),
    "user_agent" VARCHAR(512),

    CONSTRAINT "legal_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "legal_document_versions_type_status_effective_at_idx" ON "legal_document_versions"("type", "status", "effective_at");

-- CreateIndex
CREATE UNIQUE INDEX "legal_document_versions_type_version_key" ON "legal_document_versions"("type", "version");

-- CreateIndex
CREATE INDEX "legal_acceptances_user_id_version_id_idx" ON "legal_acceptances"("user_id", "version_id");

-- CreateIndex
CREATE INDEX "legal_acceptances_version_id_accepted_at_idx" ON "legal_acceptances"("version_id", "accepted_at");

-- AddForeignKey
ALTER TABLE "legal_document_versions" ADD CONSTRAINT "legal_document_versions_based_on_version_id_fkey" FOREIGN KEY ("based_on_version_id") REFERENCES "legal_document_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_document_versions" ADD CONSTRAINT "legal_document_versions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_document_versions" ADD CONSTRAINT "legal_document_versions_published_by_id_fkey" FOREIGN KEY ("published_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_acceptances" ADD CONSTRAINT "legal_acceptances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_acceptances" ADD CONSTRAINT "legal_acceptances_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "legal_document_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ─── Rules Prisma cannot express ────────────────────────────────────────────
-- These are what make the audit trail trustworthy: they hold even for a bug,
-- a script or a hand-written UPDATE, not only for the application code.

-- A draft has no version, hash or publisher; a published row has all of them.
ALTER TABLE "legal_document_versions" ADD CONSTRAINT "legal_document_versions_published_complete" CHECK (
  ("status" = 'DRAFT' AND "version" IS NULL AND "published_at" IS NULL)
  OR ("status" = 'PUBLISHED' AND "version" IS NOT NULL AND "content_hash" IS NOT NULL
      AND "change_kind" IS NOT NULL AND "published_at" IS NOT NULL AND "effective_at" IS NOT NULL)
);

-- At most one draft per document type.
CREATE UNIQUE INDEX "legal_document_versions_one_draft_per_type"
  ON "legal_document_versions"("type") WHERE "status" = 'DRAFT';

-- A published version can never be changed or deleted. A draft may be edited,
-- published (DRAFT → PUBLISHED) or discarded.
CREATE FUNCTION legal_version_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" = 'PUBLISHED' THEN
      RAISE EXCEPTION 'legal_document_versions: published version % cannot be deleted', OLD."id";
    END IF;
    RETURN OLD;
  END IF;
  IF OLD."status" = 'PUBLISHED' THEN
    RAISE EXCEPTION 'legal_document_versions: published version % cannot be changed', OLD."id";
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER legal_document_versions_immutable
  BEFORE UPDATE OR DELETE ON "legal_document_versions"
  FOR EACH ROW EXECUTE FUNCTION legal_version_immutable();

-- An acceptance may only point at a published version.
CREATE FUNCTION legal_acceptance_published_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "legal_document_versions" v WHERE v."id" = NEW."version_id" AND v."status" = 'PUBLISHED') THEN
    RAISE EXCEPTION 'legal_acceptances: version % is not published', NEW."version_id";
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER legal_acceptances_published_only
  BEFORE INSERT ON "legal_acceptances"
  FOR EACH ROW EXECUTE FUNCTION legal_acceptance_published_only();

-- Acceptances are insert-only.
CREATE FUNCTION legal_acceptance_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'legal_acceptances is append-only';
END $$;

CREATE TRIGGER legal_acceptances_append_only
  BEFORE UPDATE OR DELETE ON "legal_acceptances"
  FOR EACH ROW EXECUTE FUNCTION legal_acceptance_append_only();
