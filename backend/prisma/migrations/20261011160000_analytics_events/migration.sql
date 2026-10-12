-- First-party activity analytics (docs/analytics/README.md).
--
-- Additive only: one new table, its indexes and a nullable FK to users. No
-- existing table, column or enum is touched — "JsmfApp" already exists (legal
-- documents migration) and is reused as is — so the previous app version runs
-- unchanged against this schema and an app rollback needs no DB rollback.
--
-- No IP address and no user agent column, by design.

-- CreateTable
CREATE TABLE "analytics_events" (
    "id" UUID NOT NULL,
    "app" "JsmfApp" NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "visitor_id" UUID NOT NULL,
    "session_id" VARCHAR(64) NOT NULL,
    "user_id" UUID,
    "path" VARCHAR(512) NOT NULL,
    "referrer" VARCHAR(512),
    "utm_source" VARCHAR(128),
    "utm_medium" VARCHAR(128),
    "utm_campaign" VARCHAR(128),
    "props" JSONB,
    "device_type" VARCHAR(16) NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "analytics_events_app_occurred_at_idx" ON "analytics_events"("app", "occurred_at");

-- CreateIndex
CREATE INDEX "analytics_events_app_name_occurred_at_idx" ON "analytics_events"("app", "name", "occurred_at");

-- CreateIndex
CREATE INDEX "analytics_events_visitor_id_idx" ON "analytics_events"("visitor_id");

-- AddForeignKey
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

