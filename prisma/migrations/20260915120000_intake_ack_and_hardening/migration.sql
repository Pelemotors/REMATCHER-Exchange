-- Durable Intake ACK
ALTER TABLE "IntakeBatch" ADD COLUMN IF NOT EXISTS "acknowledgedAt" TIMESTAMP(3);
