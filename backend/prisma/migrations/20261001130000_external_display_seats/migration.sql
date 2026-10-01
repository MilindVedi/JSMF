-- TEMPORARY: manual "seats available" number for the external Razorpay
-- Payment Page phase. Shown on /prep-kit only; not real capacity. Drop this
-- column when the external checkout flow is retired.
ALTER TABLE "live_sessions" ADD COLUMN "display_seats" INTEGER;
