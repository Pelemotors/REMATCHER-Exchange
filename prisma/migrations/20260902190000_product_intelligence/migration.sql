-- Product Intelligence + Push Communication (additive)

CREATE TYPE "NotificationSourceCategory" AS ENUM ('PRODUCT', 'REMINDER', 'ADMIN', 'SYSTEM');
CREATE TYPE "PushSource" AS ENUM ('PRODUCT', 'ADMIN_CAMPAIGN', 'ADMIN_DIRECT', 'ADMIN_TEST', 'SMART_REMINDER', 'SYSTEM');
CREATE TYPE "PushTriggerType" AS ENUM ('MATCH_CREATED', 'MATCH_NOTIFIED', 'MUTUAL_INTEREST', 'REVEAL_CREATED', 'DEMAND_EXPIRING', 'OUTCOME_PENDING', 'VALIDATION_REQUEST', 'FRESHNESS', 'ADMIN_MANUAL', 'SYSTEM');
CREATE TYPE "PushDeliveryStatus" AS ENUM ('CREATED', 'SEND_ATTEMPTED', 'SENT', 'DELIVERY_FAILED', 'RECEIVED', 'CLICKED', 'DESTINATION_OPENED');
CREATE TYPE "PushAudienceType" AS ENUM ('ALL', 'SINGLE', 'MULTIPLE', 'FILTER');

ALTER TABLE "Notification" ADD COLUMN "sourceCategory" "NotificationSourceCategory" NOT NULL DEFAULT 'PRODUCT';

ALTER TABLE "PushSubscription" ADD COLUMN "lastUsedAt" TIMESTAMP(3);
ALTER TABLE "PushSubscription" ADD COLUMN "invalidatedAt" TIMESTAMP(3);

CREATE TABLE "NotificationPreference" (
    "userId" TEXT NOT NULL,
    "criticalProduct" BOOLEAN NOT NULL DEFAULT true,
    "reminders" BOOLEAN NOT NULL DEFAULT true,
    "adminCommunications" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PushCampaign" (
    "id" TEXT NOT NULL,
    "internalName" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "destinationLink" TEXT,
    "source" "PushSource" NOT NULL,
    "audienceType" "PushAudienceType" NOT NULL,
    "audienceDefinitionJson" JSONB,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "selectedCount" INTEGER NOT NULL DEFAULT 0,
    "eligibleCount" INTEGER NOT NULL DEFAULT 0,
    "sendAttemptedCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "receivedCount" INTEGER NOT NULL DEFAULT 0,
    "clickedCount" INTEGER NOT NULL DEFAULT 0,
    "destinationOpenedCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "PushCampaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PushDelivery" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT,
    "notificationId" TEXT,
    "userId" TEXT NOT NULL,
    "pushSubscriptionId" TEXT,
    "dealerId" TEXT,
    "source" "PushSource" NOT NULL,
    "triggerType" "PushTriggerType",
    "status" "PushDeliveryStatus" NOT NULL DEFAULT 'CREATED',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "idempotencyKey" TEXT,
    "failureCategory" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sendAttemptedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "destinationOpenedAt" TIMESTAMP(3),
    "metadataJson" JSONB,
    CONSTRAINT "PushDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PushDelivery_idempotencyKey_key" ON "PushDelivery"("idempotencyKey");
CREATE INDEX "PushDelivery_campaignId_idx" ON "PushDelivery"("campaignId");
CREATE INDEX "PushDelivery_userId_createdAt_idx" ON "PushDelivery"("userId", "createdAt");
CREATE INDEX "PushDelivery_status_createdAt_idx" ON "PushDelivery"("status", "createdAt");
CREATE INDEX "PushDelivery_source_createdAt_idx" ON "PushDelivery"("source", "createdAt");
CREATE INDEX "PushDelivery_notificationId_idx" ON "PushDelivery"("notificationId");
CREATE INDEX "PushDelivery_dealerId_createdAt_idx" ON "PushDelivery"("dealerId", "createdAt");

CREATE INDEX "Notification_userId_sourceCategory_createdAt_idx" ON "Notification"("userId", "sourceCategory", "createdAt");
CREATE INDEX "PushCampaign_createdByUserId_createdAt_idx" ON "PushCampaign"("createdByUserId", "createdAt");
CREATE INDEX "PushCampaign_source_createdAt_idx" ON "PushCampaign"("source", "createdAt");

ALTER TABLE "PushCampaign" ADD CONSTRAINT "PushCampaign_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PushDelivery" ADD CONSTRAINT "PushDelivery_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "PushCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PushDelivery" ADD CONSTRAINT "PushDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PushDelivery" ADD CONSTRAINT "PushDelivery_pushSubscriptionId_fkey" FOREIGN KEY ("pushSubscriptionId") REFERENCES "PushSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PushDelivery" ADD CONSTRAINT "PushDelivery_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AppEvent" ADD COLUMN "eventVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "AppEvent" ADD COLUMN "userId" TEXT;
ALTER TABLE "AppEvent" ADD COLUMN "source" TEXT;
ALTER TABLE "AppEvent" ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "AppEvent_idempotencyKey_key" ON "AppEvent"("idempotencyKey");
CREATE INDEX "AppEvent_userId_createdAt_idx" ON "AppEvent"("userId", "createdAt");
CREATE INDEX "AppEvent_source_createdAt_idx" ON "AppEvent"("source", "createdAt");
