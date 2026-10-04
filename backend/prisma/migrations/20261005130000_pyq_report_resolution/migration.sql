-- Persist how an admin closed a question report. Both columns are nullable, so
-- an older app version that does not know about them keeps working unchanged.
ALTER TABLE "pyq"."question_reports"
  ADD COLUMN "admin_note" VARCHAR(2000),
  ADD COLUMN "resolved_by_id" UUID;

ALTER TABLE "pyq"."question_reports"
  ADD CONSTRAINT "question_reports_resolved_by_id_fkey"
  FOREIGN KEY ("resolved_by_id") REFERENCES "public"."users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
