-- Per-media discovery forensic trace + dealer intent before inventory commit
ALTER TABLE "IntakeMedia" ADD COLUMN IF NOT EXISTS "discoveryJson" JSONB;
ALTER TABLE "VehicleCandidate" ADD COLUMN IF NOT EXISTS "dealerIntent" TEXT;
