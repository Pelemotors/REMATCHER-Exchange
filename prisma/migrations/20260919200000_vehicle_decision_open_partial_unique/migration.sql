-- Decision is a lifecycle/history record. Many terminal rows per vehicle are legal.
-- At most one OPEN Decision per (dealerId, vehicleId).
-- Additive index change only. No row rewrite. No reopen of terminal Decisions.

DROP INDEX IF EXISTS "VehicleDecision_dealerId_vehicleId_key";

CREATE UNIQUE INDEX "VehicleDecision_one_open_per_vehicle"
ON "VehicleDecision" ("dealerId", "vehicleId")
WHERE "status" = 'OPEN';

CREATE INDEX "VehicleDecision_dealerId_vehicleId_status_openedAt_idx"
ON "VehicleDecision" ("dealerId", "vehicleId", "status", "openedAt" DESC);
