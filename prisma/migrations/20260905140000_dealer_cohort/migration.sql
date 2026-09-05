-- Pilot cohort tag for activation analytics (never authorization).
ALTER TABLE "Dealer" ADD COLUMN IF NOT EXISTS "cohort" TEXT;
CREATE INDEX IF NOT EXISTS "Dealer_cohort_idx" ON "Dealer"("cohort");
