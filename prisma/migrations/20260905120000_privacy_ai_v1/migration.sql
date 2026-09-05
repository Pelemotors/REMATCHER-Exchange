-- Privacy & AI Model v1 + Terms acceptance + optional dealer-scoped learnings

ALTER TABLE "ExchangeLearning" ADD COLUMN IF NOT EXISTS "dealerId" TEXT;

CREATE INDEX IF NOT EXISTS "ExchangeLearning_dealerId_status_idx" ON "ExchangeLearning"("dealerId", "status");

DO $$ BEGIN
  ALTER TABLE "ExchangeLearning" ADD CONSTRAINT "ExchangeLearning_dealerId_fkey"
    FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TYPE "PrivacyConsentType" AS ENUM (
  'DEALER_MEMORY',
  'AGENT_TO_EXCHANGE_LEARNING',
  'EXCHANGE_ACTIVITY_LEARNING',
  'EXTERNAL_ACTIVITY_LEARNING'
);

CREATE TYPE "AccountDeletionStatus" AS ENUM (
  'PENDING',
  'CONFIRMED',
  'PROCESSING',
  'COMPLETED',
  'CANCELLED'
);

CREATE TABLE "PrivacyConsentDecision" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "dealerId" TEXT NOT NULL,
  "consentType" "PrivacyConsentType" NOT NULL,
  "value" BOOLEAN NOT NULL,
  "consentTextVersion" TEXT NOT NULL,
  "privacyPolicyVersion" TEXT NOT NULL,
  "source" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PrivacyConsentDecision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PrivacyConsentDecision_dealerId_consentType_createdAt_idx"
  ON "PrivacyConsentDecision"("dealerId", "consentType", "createdAt");
CREATE INDEX "PrivacyConsentDecision_userId_consentType_createdAt_idx"
  ON "PrivacyConsentDecision"("userId", "consentType", "createdAt");

ALTER TABLE "PrivacyConsentDecision"
  ADD CONSTRAINT "PrivacyConsentDecision_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PrivacyConsentDecision"
  ADD CONSTRAINT "PrivacyConsentDecision_dealerId_fkey"
  FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "LegalAcceptance" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "dealerId" TEXT NOT NULL,
  "termsVersion" TEXT NOT NULL,
  "privacyPolicyVersion" TEXT NOT NULL,
  "consentTextVersion" TEXT NOT NULL,
  "source" TEXT,
  "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LegalAcceptance_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LegalAcceptance_userId_dealerId_acceptedAt_idx"
  ON "LegalAcceptance"("userId", "dealerId", "acceptedAt");
CREATE INDEX "LegalAcceptance_dealerId_acceptedAt_idx"
  ON "LegalAcceptance"("dealerId", "acceptedAt");

ALTER TABLE "LegalAcceptance"
  ADD CONSTRAINT "LegalAcceptance_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LegalAcceptance"
  ADD CONSTRAINT "LegalAcceptance_dealerId_fkey"
  FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PrivacyAiOnboardingState" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "dealerId" TEXT NOT NULL,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PrivacyAiOnboardingState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PrivacyAiOnboardingState_userId_dealerId_key"
  ON "PrivacyAiOnboardingState"("userId", "dealerId");

ALTER TABLE "PrivacyAiOnboardingState"
  ADD CONSTRAINT "PrivacyAiOnboardingState_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PrivacyAiOnboardingState"
  ADD CONSTRAINT "PrivacyAiOnboardingState_dealerId_fkey"
  FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AccountDeletionRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "dealerId" TEXT NOT NULL,
  "status" "AccountDeletionStatus" NOT NULL DEFAULT 'PENDING',
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "confirmedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "note" TEXT,
  CONSTRAINT "AccountDeletionRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AccountDeletionRequest_dealerId_status_idx"
  ON "AccountDeletionRequest"("dealerId", "status");
CREATE INDEX "AccountDeletionRequest_userId_status_idx"
  ON "AccountDeletionRequest"("userId", "status");

ALTER TABLE "AccountDeletionRequest"
  ADD CONSTRAINT "AccountDeletionRequest_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountDeletionRequest"
  ADD CONSTRAINT "AccountDeletionRequest_dealerId_fkey"
  FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
