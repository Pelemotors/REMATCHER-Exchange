-- Canonical purchase/trade Decision workspace. Additive + idempotent backfill.

CREATE TYPE "VehicleDecisionType" AS ENUM ('PURCHASE', 'TRADE');
CREATE TYPE "VehicleDecisionStatus" AS ENUM ('OPEN', 'ACCEPTED', 'DECLINED');

CREATE TABLE "VehicleDecision" (
    "id" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "sourceCandidateId" TEXT,
    "type" "VehicleDecisionType" NOT NULL,
    "status" "VehicleDecisionStatus" NOT NULL DEFAULT 'OPEN',
    "incomingAskPrice" INTEGER,
    "incomingAgreedPrice" INTEGER,
    "outgoingVehicleId" TEXT,
    "outgoingAgreedPrice" INTEGER,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "VehicleDecision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VehicleDecision_dealerId_vehicleId_key" ON "VehicleDecision"("dealerId", "vehicleId");
CREATE INDEX "VehicleDecision_dealerId_status_openedAt_idx" ON "VehicleDecision"("dealerId", "status", "openedAt" DESC);
CREATE INDEX "VehicleDecision_vehicleId_status_idx" ON "VehicleDecision"("vehicleId", "status");
CREATE INDEX "VehicleDecision_outgoingVehicleId_idx" ON "VehicleDecision"("outgoingVehicleId");
CREATE INDEX "VehicleDecision_sourceCandidateId_idx" ON "VehicleDecision"("sourceCandidateId");

ALTER TABLE "VehicleDecision" ADD CONSTRAINT "VehicleDecision_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VehicleDecision" ADD CONSTRAINT "VehicleDecision_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VehicleDecision" ADD CONSTRAINT "VehicleDecision_outgoingVehicleId_fkey" FOREIGN KEY ("outgoingVehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VehicleDecision" ADD CONSTRAINT "VehicleDecision_sourceCandidateId_fkey" FOREIGN KEY ("sourceCandidateId") REFERENCES "VehicleCandidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Idempotent backfill: ACTIVE review vehicles without a Decision.
-- Seeds incomingAskPrice only from candidate offered/asking — never b2b/retail.
INSERT INTO "VehicleDecision" (
    "id",
    "dealerId",
    "vehicleId",
    "sourceCandidateId",
    "type",
    "status",
    "incomingAskPrice",
    "openedAt",
    "updatedAt"
)
SELECT
    md5('vehicle-decision:' || v."id"),
    v."dealerId",
    v."id",
    c."id",
    CASE
        WHEN v."dealerRelationship" = 'TRADE_IN_CANDIDATE' THEN 'TRADE'::"VehicleDecisionType"
        ELSE 'PURCHASE'::"VehicleDecisionType"
    END,
    'OPEN'::"VehicleDecisionStatus",
    COALESCE(
        CASE
            WHEN (c."commercialJson" ->> 'offeredPrice') ~ '^[0-9]+(\.[0-9]+)?$'
                THEN ROUND((c."commercialJson" ->> 'offeredPrice')::numeric)::int
        END,
        CASE
            WHEN (c."commercialJson" ->> 'askingPrice') ~ '^[0-9]+(\.[0-9]+)?$'
                THEN ROUND((c."commercialJson" ->> 'askingPrice')::numeric)::int
        END
    ),
    NOW(),
    NOW()
FROM "Vehicle" v
LEFT JOIN "VehicleCandidate" c ON c."committedVehicleId" = v."id"
WHERE v."status" = 'ACTIVE'
  AND v."dealerRelationship" IN ('OFFERED_TO_ME', 'TRADE_IN_CANDIDATE')
  AND NOT EXISTS (
      SELECT 1
      FROM "VehicleDecision" d
      WHERE d."dealerId" = v."dealerId"
        AND d."vehicleId" = v."id"
  );
