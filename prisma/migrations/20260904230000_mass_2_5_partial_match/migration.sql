-- Mass 2.5: Partial Match + Interest-Driven Inventory Enrichment

CREATE TYPE "CandidateResolutionState" AS ENUM ('RESOLVED', 'NEEDS_INFORMATION');
CREATE TYPE "InformationRequestStatus" AS ENUM ('OPEN', 'FULFILLED', 'CANCELLED', 'EXPIRED');

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'INVENTORY_ENRICHMENT';

ALTER TABLE "CandidateMatch" ADD COLUMN IF NOT EXISTS "resolutionState" "CandidateResolutionState" NOT NULL DEFAULT 'RESOLVED';
ALTER TABLE "CandidateMatch" ADD COLUMN IF NOT EXISTS "decisionBlockingUnknowns" JSONB;
CREATE INDEX IF NOT EXISTS "CandidateMatch_resolutionState_status_idx" ON "CandidateMatch"("resolutionState", "status");

CREATE TABLE "InformationRequest" (
    "id" TEXT NOT NULL,
    "requesterDealerId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "demandId" TEXT NOT NULL,
    "searchIntentVersionId" TEXT,
    "candidateMatchId" TEXT NOT NULL,
    "requestedFields" JSONB NOT NULL,
    "fieldsHash" TEXT NOT NULL,
    "status" "InformationRequestStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "fulfilledAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    CONSTRAINT "InformationRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InformationRequest_requesterDealerId_candidateMatchId_fieldsHash_key" ON "InformationRequest"("requesterDealerId", "candidateMatchId", "fieldsHash");
CREATE INDEX "InformationRequest_vehicleId_status_idx" ON "InformationRequest"("vehicleId", "status");
CREATE INDEX "InformationRequest_demandId_status_idx" ON "InformationRequest"("demandId", "status");
CREATE INDEX "InformationRequest_candidateMatchId_status_idx" ON "InformationRequest"("candidateMatchId", "status");
CREATE INDEX "InformationRequest_status_updatedAt_idx" ON "InformationRequest"("status", "updatedAt");

ALTER TABLE "InformationRequest" ADD CONSTRAINT "InformationRequest_requesterDealerId_fkey" FOREIGN KEY ("requesterDealerId") REFERENCES "Dealer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InformationRequest" ADD CONSTRAINT "InformationRequest_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InformationRequest" ADD CONSTRAINT "InformationRequest_demandId_fkey" FOREIGN KEY ("demandId") REFERENCES "Demand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InformationRequest" ADD CONSTRAINT "InformationRequest_searchIntentVersionId_fkey" FOREIGN KEY ("searchIntentVersionId") REFERENCES "SearchIntentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InformationRequest" ADD CONSTRAINT "InformationRequest_candidateMatchId_fkey" FOREIGN KEY ("candidateMatchId") REFERENCES "CandidateMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
