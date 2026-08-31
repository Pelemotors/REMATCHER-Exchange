-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('DEALER_USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'DISABLED');

-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('OWNER', 'MEMBER');

-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('ACTIVE', 'SOLD', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "FreshnessState" AS ENUM ('FRESH', 'STALE', 'UNKNOWN', 'VALIDATION_REQUIRED');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PENDING', 'PREVIEW', 'CONFIRMED', 'FAILED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "DemandStatus" AS ENUM ('DRAFT', 'PENDING_CONFIRMATION', 'ACTIVE', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ConstraintType" AS ENUM ('HARD', 'SOFT', 'EXCLUSION', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "CandidateMatchStatus" AS ENUM ('CANDIDATE', 'PENDING_VALIDATION', 'VALIDATED', 'REJECTED', 'HIDDEN');

-- CreateEnum
CREATE TYPE "ScoreBand" AS ENUM ('STRONG', 'ALTERNATIVE', 'HIDDEN');

-- CreateEnum
CREATE TYPE "ValidationType" AS ENUM ('AVAILABILITY', 'B2B_PRICE');

-- CreateEnum
CREATE TYPE "ValidationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "InterestStatus" AS ENUM ('INTERESTED', 'REJECTED', 'NO_RESPONSE');

-- CreateEnum
CREATE TYPE "OpportunityStatus" AS ENUM ('OPEN', 'INTERESTED', 'REJECTED', 'NO_RESPONSE', 'CLOSED');

-- CreateEnum
CREATE TYPE "RevealUsageSource" AS ENUM ('FREE_LIFETIME', 'MONTHLY_PLAN', 'GRACE');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('ACTIVE', 'EXHAUSTED', 'ACTION_REQUIRED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "OutcomeStatus" AS ENUM ('DEAL_CLOSED', 'PRICE_DIDNT_WORK', 'VEHICLE_DIDNT_FIT', 'DID_NOT_PROGRESS', 'STILL_IN_PROGRESS');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('VALIDATION_REQUEST', 'BUYER_MATCH', 'SELLER_OPPORTUNITY', 'MUTUAL_INTEREST', 'REVEAL', 'DEMAND_EXPIRY', 'FRESHNESS', 'SYSTEM');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'DEALER_USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dealer" (
    "id" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "city" TEXT,
    "region" TEXT,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dealer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealerMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealerMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "status" "VehicleStatus" NOT NULL DEFAULT 'ACTIVE',
    "rawInput" TEXT,
    "make" TEXT,
    "model" TEXT,
    "trim" TEXT,
    "year" INTEGER,
    "mileage" INTEGER,
    "color" TEXT,
    "ownershipHand" INTEGER,
    "ownershipType" TEXT,
    "region" TEXT,
    "retailPrice" INTEGER,
    "b2bPrice" INTEGER,
    "b2bPriceConfirmedAt" TIMESTAMP(3),
    "conditionNotes" TEXT,
    "fieldProvenance" JSONB,
    "lastInventoryUpdate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAvailabilityConfirmedAt" TIMESTAMP(3),
    "freshnessState" "FreshnessState" NOT NULL DEFAULT 'UNKNOWN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryImport" (
    "id" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "rawContent" TEXT,
    "fileName" TEXT,
    "status" "ImportStatus" NOT NULL DEFAULT 'PENDING',
    "previewJson" JSONB,
    "resultJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "InventoryImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Demand" (
    "id" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "status" "DemandStatus" NOT NULL DEFAULT 'DRAFT',
    "rawText" TEXT NOT NULL,
    "parsedJson" JSONB,
    "confirmedJson" JSONB,
    "parsedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "renewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Demand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemandConstraint" (
    "id" TEXT NOT NULL,
    "demandId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "constraintType" "ConstraintType" NOT NULL,
    "value" JSONB NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'user_confirmed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemandConstraint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateMatch" (
    "id" TEXT NOT NULL,
    "demandId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "status" "CandidateMatchStatus" NOT NULL DEFAULT 'CANDIDATE',
    "score" DOUBLE PRECISION,
    "scoreBand" "ScoreBand",
    "hardPassed" BOOLEAN NOT NULL DEFAULT false,
    "evaluationJson" JSONB,
    "explanationJson" JSONB,
    "explanationText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValidationEvent" (
    "id" TEXT NOT NULL,
    "type" "ValidationType" NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "candidateMatchId" TEXT,
    "status" "ValidationStatus" NOT NULL DEFAULT 'PENDING',
    "response" TEXT,
    "metadataJson" JSONB,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "ValidationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuyerInterest" (
    "id" TEXT NOT NULL,
    "demandId" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "candidateMatchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "InterestStatus" NOT NULL DEFAULT 'INTERESTED',
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuyerInterest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SellerOpportunity" (
    "id" TEXT NOT NULL,
    "candidateMatchId" TEXT NOT NULL,
    "buyerInterestId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "status" "OpportunityStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SellerOpportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SellerInterest" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "InterestStatus" NOT NULL DEFAULT 'INTERESTED',
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SellerInterest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MutualInterest" (
    "id" TEXT NOT NULL,
    "sellerInterestId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MutualInterest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reveal" (
    "id" TEXT NOT NULL,
    "mutualInterestId" TEXT NOT NULL,
    "buyerDealerId" TEXT NOT NULL,
    "sellerDealerId" TEXT NOT NULL,
    "candidateMatchId" TEXT,
    "revealedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "buyerContactJson" JSONB NOT NULL,
    "sellerContactJson" JSONB NOT NULL,
    "matchSummaryJson" JSONB,

    CONSTRAINT "Reveal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevealUsage" (
    "id" TEXT NOT NULL,
    "revealId" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "source" "RevealUsageSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevealUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealerCommercial" (
    "id" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "planSlug" TEXT NOT NULL DEFAULT 'onboarding',
    "planStatus" "PlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "freeRevealAllowance" INTEGER NOT NULL DEFAULT 5,
    "freeRevealUsed" INTEGER NOT NULL DEFAULT 0,
    "monthlyRevealAllowance" INTEGER NOT NULL DEFAULT 0,
    "monthlyRevealUsed" INTEGER NOT NULL DEFAULT 0,
    "billingPeriodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "billingPeriodEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealerCommercial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Outcome" (
    "id" TEXT NOT NULL,
    "revealId" TEXT NOT NULL,
    "status" "OutcomeStatus" NOT NULL,
    "notes" TEXT,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reportedByDealerId" TEXT,
    "candidateMatchId" TEXT,
    "demandId" TEXT,
    "vehicleId" TEXT,
    "buyerDealerId" TEXT,
    "sellerDealerId" TEXT,
    "matchScore" DOUBLE PRECISION,
    "scoreBand" TEXT,
    "priceGapPercent" DOUBLE PRECISION,
    "freshnessState" TEXT,
    "learningJson" JSONB,

    CONSTRAINT "Outcome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductConfig" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiOperationLog" (
    "id" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "model" TEXT,
    "promptVersion" TEXT,
    "success" BOOLEAN NOT NULL,
    "latencyMs" INTEGER,
    "usageJson" JSONB,
    "errorMessage" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiOperationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppEvent" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "dealerId" TEXT,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "DealerMembership_userId_dealerId_key" ON "DealerMembership"("userId", "dealerId");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateMatch_demandId_vehicleId_key" ON "CandidateMatch"("demandId", "vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "BuyerInterest_candidateMatchId_dealerId_key" ON "BuyerInterest"("candidateMatchId", "dealerId");

-- CreateIndex
CREATE UNIQUE INDEX "SellerOpportunity_candidateMatchId_key" ON "SellerOpportunity"("candidateMatchId");

-- CreateIndex
CREATE UNIQUE INDEX "SellerOpportunity_buyerInterestId_key" ON "SellerOpportunity"("buyerInterestId");

-- CreateIndex
CREATE UNIQUE INDEX "SellerInterest_opportunityId_key" ON "SellerInterest"("opportunityId");

-- CreateIndex
CREATE UNIQUE INDEX "MutualInterest_sellerInterestId_key" ON "MutualInterest"("sellerInterestId");

-- CreateIndex
CREATE UNIQUE INDEX "Reveal_mutualInterestId_key" ON "Reveal"("mutualInterestId");

-- CreateIndex
CREATE INDEX "RevealUsage_dealerId_createdAt_idx" ON "RevealUsage"("dealerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RevealUsage_revealId_dealerId_key" ON "RevealUsage"("revealId", "dealerId");

-- CreateIndex
CREATE UNIQUE INDEX "DealerCommercial_dealerId_key" ON "DealerCommercial"("dealerId");

-- CreateIndex
CREATE UNIQUE INDEX "Outcome_revealId_key" ON "Outcome"("revealId");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE UNIQUE INDEX "ProductConfig_key_key" ON "ProductConfig"("key");

-- CreateIndex
CREATE INDEX "AiOperationLog_operation_createdAt_idx" ON "AiOperationLog"("operation", "createdAt");

-- CreateIndex
CREATE INDEX "AppEvent_eventType_createdAt_idx" ON "AppEvent"("eventType", "createdAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealerMembership" ADD CONSTRAINT "DealerMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealerMembership" ADD CONSTRAINT "DealerMembership_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Demand" ADD CONSTRAINT "Demand_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandConstraint" ADD CONSTRAINT "DemandConstraint_demandId_fkey" FOREIGN KEY ("demandId") REFERENCES "Demand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateMatch" ADD CONSTRAINT "CandidateMatch_demandId_fkey" FOREIGN KEY ("demandId") REFERENCES "Demand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateMatch" ADD CONSTRAINT "CandidateMatch_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationEvent" ADD CONSTRAINT "ValidationEvent_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationEvent" ADD CONSTRAINT "ValidationEvent_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationEvent" ADD CONSTRAINT "ValidationEvent_candidateMatchId_fkey" FOREIGN KEY ("candidateMatchId") REFERENCES "CandidateMatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyerInterest" ADD CONSTRAINT "BuyerInterest_demandId_fkey" FOREIGN KEY ("demandId") REFERENCES "Demand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyerInterest" ADD CONSTRAINT "BuyerInterest_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyerInterest" ADD CONSTRAINT "BuyerInterest_candidateMatchId_fkey" FOREIGN KEY ("candidateMatchId") REFERENCES "CandidateMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyerInterest" ADD CONSTRAINT "BuyerInterest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerOpportunity" ADD CONSTRAINT "SellerOpportunity_candidateMatchId_fkey" FOREIGN KEY ("candidateMatchId") REFERENCES "CandidateMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerOpportunity" ADD CONSTRAINT "SellerOpportunity_buyerInterestId_fkey" FOREIGN KEY ("buyerInterestId") REFERENCES "BuyerInterest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerOpportunity" ADD CONSTRAINT "SellerOpportunity_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerInterest" ADD CONSTRAINT "SellerInterest_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "SellerOpportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerInterest" ADD CONSTRAINT "SellerInterest_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerInterest" ADD CONSTRAINT "SellerInterest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MutualInterest" ADD CONSTRAINT "MutualInterest_sellerInterestId_fkey" FOREIGN KEY ("sellerInterestId") REFERENCES "SellerInterest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reveal" ADD CONSTRAINT "Reveal_mutualInterestId_fkey" FOREIGN KEY ("mutualInterestId") REFERENCES "MutualInterest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reveal" ADD CONSTRAINT "Reveal_buyerDealerId_fkey" FOREIGN KEY ("buyerDealerId") REFERENCES "Dealer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reveal" ADD CONSTRAINT "Reveal_sellerDealerId_fkey" FOREIGN KEY ("sellerDealerId") REFERENCES "Dealer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevealUsage" ADD CONSTRAINT "RevealUsage_revealId_fkey" FOREIGN KEY ("revealId") REFERENCES "Reveal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevealUsage" ADD CONSTRAINT "RevealUsage_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealerCommercial" ADD CONSTRAINT "DealerCommercial_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Outcome" ADD CONSTRAINT "Outcome_revealId_fkey" FOREIGN KEY ("revealId") REFERENCES "Reveal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiOperationLog" ADD CONSTRAINT "AiOperationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

