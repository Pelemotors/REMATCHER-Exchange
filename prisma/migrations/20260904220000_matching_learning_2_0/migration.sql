-- AlterEnum ScoreBand
ALTER TYPE "ScoreBand" ADD VALUE IF NOT EXISTS 'GOOD';
ALTER TYPE "ScoreBand" ADD VALUE IF NOT EXISTS 'NO_MATCH';

-- CreateEnum
CREATE TYPE "SearchIntentStatus" AS ENUM ('DRAFT', 'PENDING_CONFIRMATION', 'ACTIVE', 'SUPERSEDED', 'CLOSED');
CREATE TYPE "ExchangeEvidenceType" AS ENUM ('SYSTEM_OBSERVED', 'DEALER_REPORTED', 'BILATERAL_CONFIRMED', 'AI_INFERRED');
CREATE TYPE "ExchangePrivacyClass" AS ENUM ('SYSTEM', 'DEALER_SCOPED', 'AGGREGATE_SAFE', 'RESTRICTED');
CREATE TYPE "RelevanceOutcome" AS ENUM ('RELEVANT', 'IRRELEVANT', 'UNKNOWN');
CREATE TYPE "TransactionOutcome" AS ENUM ('DEAL_CONFIRMED', 'NO_DEAL', 'STILL_ACTIVE', 'UNKNOWN');
CREATE TYPE "OutcomeReasonCategory" AS ENUM ('PRICE', 'VEHICLE_CONDITION', 'SPEC_MISMATCH', 'AVAILABILITY', 'CUSTOMER_CHANGED_MIND', 'FINANCING', 'DEALER_DECISION', 'TIMING', 'SOLD_ELSEWHERE', 'NO_RESPONSE', 'OTHER', 'UNKNOWN');
CREATE TYPE "ExchangeLearningStatus" AS ENUM ('ACTIVE', 'WEAKENED', 'SUPERSEDED', 'STALE');

-- CreateTable SearchIntentVersion
CREATE TABLE "SearchIntentVersion" (
    "id" TEXT NOT NULL,
    "demandId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "SearchIntentStatus" NOT NULL DEFAULT 'DRAFT',
    "source" TEXT NOT NULL DEFAULT 'agent',
    "naturalLanguageSummary" TEXT,
    "structuredIntent" JSONB NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SearchIntentVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SearchIntentVersion_demandId_version_key" ON "SearchIntentVersion"("demandId", "version");
CREATE INDEX "SearchIntentVersion_demandId_status_idx" ON "SearchIntentVersion"("demandId", "status");

ALTER TABLE "Demand" ADD COLUMN IF NOT EXISTS "activeSearchIntentVersionId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Demand_activeSearchIntentVersionId_key" ON "Demand"("activeSearchIntentVersionId");

ALTER TABLE "CandidateMatch" ADD COLUMN IF NOT EXISTS "searchIntentVersionId" TEXT;
ALTER TABLE "CandidateMatch" ADD COLUMN IF NOT EXISTS "engineVersion" TEXT;
ALTER TABLE "CandidateMatch" ADD COLUMN IF NOT EXISTS "matchBandV2" TEXT;
ALTER TABLE "CandidateMatch" ADD COLUMN IF NOT EXISTS "evaluationV2Json" JSONB;
ALTER TABLE "CandidateMatch" ADD COLUMN IF NOT EXISTS "intelligenceShadowJson" JSONB;
CREATE INDEX IF NOT EXISTS "CandidateMatch_searchIntentVersionId_idx" ON "CandidateMatch"("searchIntentVersionId");

CREATE TABLE "ExchangeEvent" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "evidenceType" "ExchangeEvidenceType" NOT NULL DEFAULT 'SYSTEM_OBSERVED',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "evidenceNote" TEXT,
    "dealerId" TEXT,
    "vehicleId" TEXT,
    "demandId" TEXT,
    "candidateMatchId" TEXT,
    "eventData" JSONB,
    "reason" TEXT,
    "privacyClass" "ExchangePrivacyClass" NOT NULL DEFAULT 'DEALER_SCOPED',
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExchangeEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ExchangeEvent_idempotencyKey_key" ON "ExchangeEvent"("idempotencyKey");
CREATE INDEX "ExchangeEvent_eventType_occurredAt_idx" ON "ExchangeEvent"("eventType", "occurredAt");
CREATE INDEX "ExchangeEvent_dealerId_occurredAt_idx" ON "ExchangeEvent"("dealerId", "occurredAt");
CREATE INDEX "ExchangeEvent_vehicleId_occurredAt_idx" ON "ExchangeEvent"("vehicleId", "occurredAt");
CREATE INDEX "ExchangeEvent_demandId_occurredAt_idx" ON "ExchangeEvent"("demandId", "occurredAt");
CREATE INDEX "ExchangeEvent_candidateMatchId_idx" ON "ExchangeEvent"("candidateMatchId");

CREATE TABLE "ExchangeCase" (
    "id" TEXT NOT NULL,
    "caseType" TEXT NOT NULL DEFAULT 'MATCH',
    "dealerId" TEXT,
    "demandId" TEXT,
    "vehicleId" TEXT,
    "candidateMatchId" TEXT,
    "searchIntentVersionId" TEXT,
    "demandSnapshot" JSONB,
    "vehicleSnapshot" JSONB,
    "matchEvaluationSnapshot" JSONB,
    "searchIntentSnapshot" JSONB,
    "rationale" TEXT,
    "relevanceOutcome" "RelevanceOutcome" NOT NULL DEFAULT 'UNKNOWN',
    "transactionOutcome" "TransactionOutcome" NOT NULL DEFAULT 'UNKNOWN',
    "outcomeReasonCategory" "OutcomeReasonCategory" NOT NULL DEFAULT 'UNKNOWN',
    "evidenceType" "ExchangeEvidenceType" NOT NULL DEFAULT 'SYSTEM_OBSERVED',
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ExchangeCase_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ExchangeCase_caseType_createdAt_idx" ON "ExchangeCase"("caseType", "createdAt");
CREATE INDEX "ExchangeCase_candidateMatchId_idx" ON "ExchangeCase"("candidateMatchId");
CREATE INDEX "ExchangeCase_vehicleId_createdAt_idx" ON "ExchangeCase"("vehicleId", "createdAt");
CREATE INDEX "ExchangeCase_demandId_createdAt_idx" ON "ExchangeCase"("demandId", "createdAt");

CREATE TABLE "ExchangeLearning" (
    "id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "learningType" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "structuredInsight" JSONB,
    "segmentContext" JSONB,
    "supportingCaseIds" JSONB,
    "contradictingCaseIds" JSONB,
    "supportCount" INTEGER NOT NULL DEFAULT 0,
    "contradictCount" INTEGER NOT NULL DEFAULT 0,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "status" "ExchangeLearningStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastEvaluatedAt" TIMESTAMP(3),
    CONSTRAINT "ExchangeLearning_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ExchangeLearning_topic_status_idx" ON "ExchangeLearning"("topic", "status");
CREATE INDEX "ExchangeLearning_learningType_status_idx" ON "ExchangeLearning"("learningType", "status");
CREATE INDEX "ExchangeLearning_status_lastEvaluatedAt_idx" ON "ExchangeLearning"("status", "lastEvaluatedAt");

CREATE TABLE "MatchDecisionComparison" (
    "id" TEXT NOT NULL,
    "candidateMatchId" TEXT NOT NULL,
    "engineBand" TEXT NOT NULL,
    "engineScore" DOUBLE PRECISION,
    "intelligenceDecision" JSONB NOT NULL,
    "intelligenceBand" TEXT,
    "intelligenceConfidence" DOUBLE PRECISION,
    "modelVersion" TEXT,
    "promptVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MatchDecisionComparison_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MatchDecisionComparison_candidateMatchId_createdAt_idx" ON "MatchDecisionComparison"("candidateMatchId", "createdAt");
CREATE INDEX "MatchDecisionComparison_engineBand_intelligenceBand_idx" ON "MatchDecisionComparison"("engineBand", "intelligenceBand");

ALTER TABLE "SearchIntentVersion" ADD CONSTRAINT "SearchIntentVersion_demandId_fkey" FOREIGN KEY ("demandId") REFERENCES "Demand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Demand" ADD CONSTRAINT "Demand_activeSearchIntentVersionId_fkey" FOREIGN KEY ("activeSearchIntentVersionId") REFERENCES "SearchIntentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CandidateMatch" ADD CONSTRAINT "CandidateMatch_searchIntentVersionId_fkey" FOREIGN KEY ("searchIntentVersionId") REFERENCES "SearchIntentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExchangeEvent" ADD CONSTRAINT "ExchangeEvent_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExchangeEvent" ADD CONSTRAINT "ExchangeEvent_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExchangeCase" ADD CONSTRAINT "ExchangeCase_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExchangeCase" ADD CONSTRAINT "ExchangeCase_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExchangeCase" ADD CONSTRAINT "ExchangeCase_candidateMatchId_fkey" FOREIGN KEY ("candidateMatchId") REFERENCES "CandidateMatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExchangeCase" ADD CONSTRAINT "ExchangeCase_searchIntentVersionId_fkey" FOREIGN KEY ("searchIntentVersionId") REFERENCES "SearchIntentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MatchDecisionComparison" ADD CONSTRAINT "MatchDecisionComparison_candidateMatchId_fkey" FOREIGN KEY ("candidateMatchId") REFERENCES "CandidateMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
