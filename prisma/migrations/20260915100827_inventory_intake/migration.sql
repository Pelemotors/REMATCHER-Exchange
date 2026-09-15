-- CreateEnum
CREATE TYPE "IntakeSource" AS ENUM ('IOS_SHARE', 'ANDROID_SHARE', 'WEB_UPLOAD', 'MANUAL', 'IMPORT');

-- CreateEnum
CREATE TYPE "IntakeBatchStatus" AS ENUM ('RECEIVING', 'RECEIVED', 'PROCESSING', 'NEEDS_REVIEW', 'READY', 'COMMITTED', 'FAILED');

-- CreateEnum
CREATE TYPE "IntakeMediaProcessingStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "VehicleCandidateStatus" AS ENUM ('DETECTED', 'IDENTIFYING', 'NEEDS_INFO', 'NEEDS_CONFIRMATION', 'READY', 'COMMITTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "VehicleCandidateReviewStatus" AS ENUM ('NONE', 'PENDING', 'RESOLVED');

-- DropIndex
DROP INDEX "CandidateMatch_demandId_status_idx";

-- DropIndex
DROP INDEX "DealerMemoryItem_dealerId_topicKey_status_updatedAt_idx";

-- DropIndex
DROP INDEX "Demand_dealerId_status_expiresAt_idx";

-- DropIndex
DROP INDEX "Demand_dealerId_status_updatedAt_idx";

-- DropIndex
DROP INDEX "SellerOpportunity_vehicleId_status_idx";

-- DropIndex
DROP INDEX "ValidationEvent_dealerId_status_vehicleId_idx";

-- DropIndex
DROP INDEX "Vehicle_dealerId_status_freshnessState_idx";

-- DropIndex
DROP INDEX "Vehicle_dealerId_status_updatedAt_idx";

-- CreateTable
CREATE TABLE "IntakeBatch" (
    "id" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "source" "IntakeSource" NOT NULL,
    "status" "IntakeBatchStatus" NOT NULL DEFAULT 'RECEIVING',
    "clientBatchId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processingStartedAt" TIMESTAMP(3),
    "processingCompletedAt" TIMESTAMP(3),
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "sourceMetadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntakeBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntakeMedia" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "bytes" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "checksum" TEXT,
    "originalOrder" INTEGER NOT NULL DEFAULT 0,
    "processingStatus" "IntakeMediaProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "categoryHint" "VehicleMediaCategory",
    "categoryConfidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntakeMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntakeText" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "provenance" TEXT NOT NULL DEFAULT 'WHATSAPP_TEXT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntakeText_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleCandidate" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "status" "VehicleCandidateStatus" NOT NULL DEFAULT 'DETECTED',
    "reviewStatus" "VehicleCandidateReviewStatus" NOT NULL DEFAULT 'NONE',
    "detectedPlate" TEXT,
    "plateConfidence" DOUBLE PRECISION,
    "plateNormalized" TEXT,
    "govIdentityJson" JSONB,
    "govState" TEXT,
    "govLookedUpAt" TIMESTAMP(3),
    "commercialJson" JSONB,
    "fieldProvenance" JSONB,
    "confidenceBand" TEXT,
    "missingFields" JSONB,
    "conflictsJson" JSONB,
    "existingVehicleId" TEXT,
    "committedVehicleId" TEXT,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleCandidateMedia" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "VehicleCandidateMedia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntakeBatch_dealerId_status_receivedAt_idx" ON "IntakeBatch"("dealerId", "status", "receivedAt");

-- CreateIndex
CREATE INDEX "IntakeBatch_status_updatedAt_idx" ON "IntakeBatch"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "IntakeBatch_dealerId_clientBatchId_key" ON "IntakeBatch"("dealerId", "clientBatchId");

-- CreateIndex
CREATE UNIQUE INDEX "IntakeMedia_storageKey_key" ON "IntakeMedia"("storageKey");

-- CreateIndex
CREATE INDEX "IntakeMedia_batchId_originalOrder_idx" ON "IntakeMedia"("batchId", "originalOrder");

-- CreateIndex
CREATE INDEX "IntakeMedia_processingStatus_idx" ON "IntakeMedia"("processingStatus");

-- CreateIndex
CREATE INDEX "IntakeText_batchId_idx" ON "IntakeText"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleCandidate_committedVehicleId_key" ON "VehicleCandidate"("committedVehicleId");

-- CreateIndex
CREATE INDEX "VehicleCandidate_batchId_status_idx" ON "VehicleCandidate"("batchId", "status");

-- CreateIndex
CREATE INDEX "VehicleCandidate_dealerId_status_updatedAt_idx" ON "VehicleCandidate"("dealerId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "VehicleCandidate_dealerId_plateNormalized_idx" ON "VehicleCandidate"("dealerId", "plateNormalized");

-- CreateIndex
CREATE INDEX "VehicleCandidate_existingVehicleId_idx" ON "VehicleCandidate"("existingVehicleId");

-- CreateIndex
CREATE INDEX "VehicleCandidateMedia_mediaId_idx" ON "VehicleCandidateMedia"("mediaId");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleCandidateMedia_candidateId_mediaId_key" ON "VehicleCandidateMedia"("candidateId", "mediaId");

-- AddForeignKey
ALTER TABLE "IntakeBatch" ADD CONSTRAINT "IntakeBatch_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeMedia" ADD CONSTRAINT "IntakeMedia_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "IntakeBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeText" ADD CONSTRAINT "IntakeText_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "IntakeBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleCandidate" ADD CONSTRAINT "VehicleCandidate_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "IntakeBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleCandidate" ADD CONSTRAINT "VehicleCandidate_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleCandidate" ADD CONSTRAINT "VehicleCandidate_existingVehicleId_fkey" FOREIGN KEY ("existingVehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleCandidateMedia" ADD CONSTRAINT "VehicleCandidateMedia_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "VehicleCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleCandidateMedia" ADD CONSTRAINT "VehicleCandidateMedia_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "IntakeMedia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "InformationRequest_requesterDealerId_candidateMatchId_fieldsHas" RENAME TO "InformationRequest_requesterDealerId_candidateMatchId_field_key";
