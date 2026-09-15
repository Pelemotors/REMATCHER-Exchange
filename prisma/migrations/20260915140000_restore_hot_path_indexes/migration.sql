-- Restore hot-path indexes dropped by 20260915100827_inventory_intake (Prisma drift artifact).
-- Field Test first; same SQL is production-safe (IF NOT EXISTS).

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
