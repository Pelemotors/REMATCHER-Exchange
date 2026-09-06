-- Performance hot-path indexes for dealer navigation and agent state.
-- Applied to production Supabase on 2026-09-06 and kept in migration history here.

CREATE INDEX IF NOT EXISTS "Vehicle_dealerId_status_updatedAt_idx"
  ON "Vehicle" ("dealerId", "status", "updatedAt" DESC);

CREATE INDEX IF NOT EXISTS "Vehicle_dealerId_status_freshnessState_idx"
  ON "Vehicle" ("dealerId", "status", "freshnessState");

CREATE INDEX IF NOT EXISTS "Demand_dealerId_status_updatedAt_idx"
  ON "Demand" ("dealerId", "status", "updatedAt" DESC);

CREATE INDEX IF NOT EXISTS "Demand_dealerId_status_expiresAt_idx"
  ON "Demand" ("dealerId", "status", "expiresAt");

CREATE INDEX IF NOT EXISTS "ValidationEvent_dealerId_status_vehicleId_idx"
  ON "ValidationEvent" ("dealerId", "status", "vehicleId");

CREATE INDEX IF NOT EXISTS "SellerOpportunity_vehicleId_status_idx"
  ON "SellerOpportunity" ("vehicleId", "status");

CREATE INDEX IF NOT EXISTS "CandidateMatch_demandId_status_idx"
  ON "CandidateMatch" ("demandId", "status");

CREATE INDEX IF NOT EXISTS "DealerMemoryItem_dealerId_topicKey_status_updatedAt_idx"
  ON "DealerMemoryItem" ("dealerId", "topicKey", "status", "updatedAt" DESC);
