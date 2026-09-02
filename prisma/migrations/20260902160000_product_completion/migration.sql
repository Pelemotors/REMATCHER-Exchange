-- Product Completion: dealer onboarding state + notification type + event indexes

CREATE TABLE "DealerOnboardingState" (
    "id" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "introCompletedAt" TIMESTAMP(3),
    "profileCompletedAt" TIMESTAMP(3),
    "inventorySeenAt" TIMESTAMP(3),
    "demandSeenAt" TIMESTAMP(3),
    "pushPromptedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "currentStep" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealerOnboardingState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DealerOnboardingState_dealerId_key" ON "DealerOnboardingState"("dealerId");

ALTER TABLE "DealerOnboardingState" ADD CONSTRAINT "DealerOnboardingState_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TYPE "NotificationType" ADD VALUE 'OUTCOME_REMINDER';

CREATE INDEX "AppEvent_dealerId_createdAt_idx" ON "AppEvent"("dealerId", "createdAt");
CREATE INDEX "AppEvent_entityType_entityId_idx" ON "AppEvent"("entityType", "entityId");
