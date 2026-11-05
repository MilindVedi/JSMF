-- Subscription & pricing management: the free trial and the shared benefits
-- list. Purely additive: two new tables, nothing existing is altered, so an
-- app rollback needs no database rollback (the old code never reads them).

-- CreateTable
CREATE TABLE "pyq"."subscription_settings" (
    "id" VARCHAR(20) NOT NULL DEFAULT 'global',
    "trial_enabled" BOOLEAN NOT NULL DEFAULT false,
    "trial_days" SMALLINT NOT NULL DEFAULT 7,
    "features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "subscription_settings_pkey" PRIMARY KEY ("id"),
    -- The same bounds the API validates, held here too so a hand-run UPDATE
    -- cannot hand out a year-long trial by a typo.
    CONSTRAINT "subscription_settings_trial_days_range" CHECK ("trial_days" BETWEEN 1 AND 90),
    CONSTRAINT "subscription_settings_singleton" CHECK ("id" = 'global')
);

-- CreateTable
CREATE TABLE "pyq"."trials" (
    "user_id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "days" SMALLINT NOT NULL,

    CONSTRAINT "trials_pkey" PRIMARY KEY ("user_id"),
    CONSTRAINT "trials_days_range" CHECK ("days" BETWEEN 1 AND 90),
    CONSTRAINT "trials_ends_after_start" CHECK ("ends_at" > "started_at")
);

-- AddForeignKey
ALTER TABLE "pyq"."trials" ADD CONSTRAINT "trials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The one row, trial off, with the benefits every plan shows today.
INSERT INTO "pyq"."subscription_settings" ("id", "trial_enabled", "trial_days", "features", "updated_at")
VALUES (
    'global',
    false,
    7,
    ARRAY[
        'Unlimited practice across all 3 exams',
        'All 19 subjects, last 5 years',
        'Timed custom tests & full statistics',
        'Early access to new question drops',
        'Priority support'
    ]::TEXT[],
    CURRENT_TIMESTAMP
);
