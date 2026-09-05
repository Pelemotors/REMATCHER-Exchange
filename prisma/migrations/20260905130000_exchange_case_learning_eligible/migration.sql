-- Gate optional Exchange learning consumption of dealer activity cases.
-- Operational case rows still exist when consent is off; learningEligible=false.

ALTER TABLE "ExchangeCase" ADD COLUMN IF NOT EXISTS "learningEligible" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "ExchangeCase_learningEligible_createdAt_idx"
  ON "ExchangeCase"("learningEligible", "createdAt");
