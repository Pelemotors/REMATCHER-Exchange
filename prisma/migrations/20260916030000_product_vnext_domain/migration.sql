-- Product VNext: Customer ≠ Demand, Ownership ≠ Visibility, DealerOpportunity, Demand PAUSED

-- Customer
CREATE TYPE "CustomerStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "name" TEXT,
    "normalizedPhone" TEXT,
    "rawPhone" TEXT,
    "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE',
    "sourceJson" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Customer_dealerId_status_updatedAt_idx" ON "Customer"("dealerId", "status", "updatedAt" DESC);
CREATE INDEX "Customer_dealerId_normalizedPhone_idx" ON "Customer"("dealerId", "normalizedPhone");
CREATE UNIQUE INDEX "Customer_dealerId_normalizedPhone_key" ON "Customer"("dealerId", "normalizedPhone");

ALTER TABLE "Customer" ADD CONSTRAINT "Customer_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Vehicle relationship × visibility
CREATE TYPE "DealerVehicleRelationship" AS ENUM ('OWNED', 'INVENTORY', 'OFFERED_TO_ME', 'TRADE_IN_CANDIDATE', 'EXTERNAL');
CREATE TYPE "VehicleVisibility" AS ENUM ('PRIVATE', 'ANONYMOUS_NETWORK');

ALTER TABLE "Vehicle" ADD COLUMN "dealerRelationship" "DealerVehicleRelationship" NOT NULL DEFAULT 'OWNED';
ALTER TABLE "Vehicle" ADD COLUMN "visibility" "VehicleVisibility" NOT NULL DEFAULT 'PRIVATE';

-- Backfill: existing network-eligible inventory stays on network; others stay private
UPDATE "Vehicle"
SET "visibility" = 'ANONYMOUS_NETWORK'
WHERE "status" = 'ACTIVE' AND "mediaReady" = true;

CREATE INDEX "Vehicle_dealerId_dealerRelationship_visibility_idx" ON "Vehicle"("dealerId", "dealerRelationship", "visibility");
CREATE INDEX "Vehicle_visibility_status_mediaReady_idx" ON "Vehicle"("visibility", "status", "mediaReady");

-- Demand: customer link, PAUSED, network visibility
CREATE TYPE "DemandNetworkVisibility" AS ENUM ('PRIVATE', 'ANONYMOUS_NETWORK');

-- Demand PAUSED status (idempotent)
DO $$ BEGIN
  ALTER TYPE "DemandStatus" ADD VALUE 'PAUSED';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "Demand" ADD COLUMN "customerId" TEXT;
ALTER TABLE "Demand" ADD COLUMN "networkVisibility" "DemandNetworkVisibility" NOT NULL DEFAULT 'ANONYMOUS_NETWORK';
ALTER TABLE "Demand" ADD COLUMN "pausedAt" TIMESTAMP(3);

CREATE INDEX "Demand_customerId_status_idx" ON "Demand"("customerId", "status");
CREATE INDEX "Demand_status_networkVisibility_idx" ON "Demand"("status", "networkVisibility");

ALTER TABLE "Demand" ADD CONSTRAINT "Demand_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Proactive DealerOpportunity
CREATE TYPE "DealerOpportunityType" AS ENUM (
  'NETWORK_SUPPLY_FOR_MY_DEMAND',
  'NETWORK_DEMAND_FOR_MY_VEHICLE',
  'PRIVATE_VEHICLE_FOR_MY_CUSTOMER',
  'PRICE_OPENED_MATCH',
  'DEMAND_FLEXIBILITY_OPENED_MATCH',
  'INTEREST_WAITING',
  'MUTUAL_INTEREST',
  'UNMET_DEMAND',
  'OTHER'
);

CREATE TYPE "DealerOpportunityLifecycle" AS ENUM ('OPEN', 'DISMISSED', 'RESOLVED', 'SUPPRESSED');

CREATE TABLE "DealerOpportunity" (
    "id" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "type" "DealerOpportunityType" NOT NULL,
    "status" "DealerOpportunityLifecycle" NOT NULL DEFAULT 'OPEN',
    "priority" INTEGER NOT NULL DEFAULT 50,
    "dedupeKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "reasonJson" JSONB,
    "vehicleId" TEXT,
    "demandId" TEXT,
    "customerId" TEXT,
    "score" DOUBLE PRECISION,
    "dismissedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealerOpportunity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DealerOpportunity_dealerId_dedupeKey_key" ON "DealerOpportunity"("dealerId", "dedupeKey");
CREATE INDEX "DealerOpportunity_dealerId_status_priority_createdAt_idx" ON "DealerOpportunity"("dealerId", "status", "priority", "createdAt" DESC);
CREATE INDEX "DealerOpportunity_vehicleId_idx" ON "DealerOpportunity"("vehicleId");
CREATE INDEX "DealerOpportunity_demandId_idx" ON "DealerOpportunity"("demandId");

ALTER TABLE "DealerOpportunity" ADD CONSTRAINT "DealerOpportunity_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DealerOpportunity" ADD CONSTRAINT "DealerOpportunity_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DealerOpportunity" ADD CONSTRAINT "DealerOpportunity_demandId_fkey" FOREIGN KEY ("demandId") REFERENCES "Demand"("id") ON DELETE SET NULL ON UPDATE CASCADE;
