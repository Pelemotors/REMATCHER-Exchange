-- AlterTable User: OAuth-ready
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "accountStatus" TEXT NOT NULL DEFAULT 'ACTIVE';

-- MembershipRole ADMIN (Prisma enums in Postgres)
DO $$ BEGIN
  ALTER TYPE "MembershipRole" ADD VALUE IF NOT EXISTS 'ADMIN';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum types (IF NOT EXISTS via DO blocks where needed)
DO $$ BEGIN CREATE TYPE "AccountLifecycleStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DEACTIVATED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "IdentityProvider" AS ENUM ('APPLE', 'GOOGLE', 'EMAIL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ClientPlatform" AS ENUM ('IOS', 'ANDROID', 'WEB'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "PushTokenProvider" AS ENUM ('APNS', 'FCM', 'WEB_PUSH'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "PushPermissionState" AS ENUM ('UNKNOWN', 'GRANTED', 'DENIED', 'PROVISIONAL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "BillingProvider" AS ENUM ('APPLE', 'GOOGLE', 'MANUAL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "BillingEnvironment" AS ENUM ('SANDBOX', 'PRODUCTION'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ProviderSubscriptionStatus" AS ENUM ('ACTIVE', 'IN_GRACE_PERIOD', 'CANCELLED', 'EXPIRED', 'REFUNDED', 'REVOKED', 'PENDING'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "EntitlementStatus" AS ENUM ('FREE', 'FOUNDING_DEALER', 'TRIAL', 'ACTIVE', 'GRACE_PERIOD', 'EXPIRED', 'SUSPENDED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "NotificationEventType" AS ENUM ('NEW_MATCH', 'MUTUAL_INTEREST', 'INTAKE_NEEDS_INFO', 'SEARCH_EXPIRING', 'SUBSCRIPTION', 'AGENT_ATTENTION'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Fix accountStatus column type if created as TEXT
ALTER TABLE "User" DROP COLUMN IF EXISTS "accountStatus";
ALTER TABLE "User" ADD COLUMN "accountStatus" "AccountLifecycleStatus" NOT NULL DEFAULT 'ACTIVE';

CREATE TABLE IF NOT EXISTS "ExternalIdentity" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" "IdentityProvider" NOT NULL,
  "providerSubject" TEXT NOT NULL,
  "verifiedEmail" TEXT,
  "rawProfileJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExternalIdentity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DeviceInstallation" (
  "id" TEXT NOT NULL,
  "installationId" TEXT NOT NULL,
  "userId" TEXT,
  "dealerId" TEXT,
  "platform" "ClientPlatform" NOT NULL,
  "appVersion" TEXT,
  "buildNumber" TEXT,
  "pushToken" TEXT,
  "pushProvider" "PushTokenProvider",
  "pushPermission" "PushPermissionState" NOT NULL DEFAULT 'UNKNOWN',
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "DeviceInstallation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SubscriptionPlan" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "nameHe" TEXT NOT NULL,
  "description" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ProviderProduct" (
  "id" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "provider" "BillingProvider" NOT NULL,
  "externalProductId" TEXT NOT NULL,
  "environment" "BillingEnvironment" NOT NULL DEFAULT 'SANDBOX',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProviderProduct_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DealerSubscription" (
  "id" TEXT NOT NULL,
  "dealerId" TEXT NOT NULL,
  "planId" TEXT,
  "provider" "BillingProvider" NOT NULL,
  "externalSubscriptionId" TEXT,
  "externalProductId" TEXT,
  "status" "ProviderSubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
  "autoRenew" BOOLEAN NOT NULL DEFAULT true,
  "purchasedAt" TIMESTAMP(3),
  "currentPeriodStart" TIMESTAMP(3),
  "currentPeriodEnd" TIMESTAMP(3),
  "gracePeriodEndsAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "environment" "BillingEnvironment" NOT NULL DEFAULT 'SANDBOX',
  "purchaserUserId" TEXT,
  "rawSnapshotJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DealerSubscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ProviderTransaction" (
  "id" TEXT NOT NULL,
  "dealerId" TEXT NOT NULL,
  "subscriptionId" TEXT,
  "provider" "BillingProvider" NOT NULL,
  "externalTransactionId" TEXT NOT NULL,
  "externalProductId" TEXT,
  "eventType" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "environment" "BillingEnvironment" NOT NULL DEFAULT 'SANDBOX',
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "rawPayloadJson" JSONB,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProviderTransaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DealerEntitlement" (
  "id" TEXT NOT NULL,
  "dealerId" TEXT NOT NULL,
  "status" "EntitlementStatus" NOT NULL DEFAULT 'FREE',
  "planSlug" TEXT,
  "trialStartedAt" TIMESTAMP(3),
  "trialEndsAt" TIMESTAMP(3),
  "trialConsumedAt" TIMESTAMP(3),
  "trialEligible" BOOLEAN NOT NULL DEFAULT true,
  "foundingDealer" BOOLEAN NOT NULL DEFAULT false,
  "currentPeriodEnd" TIMESTAMP(3),
  "gracePeriodEndsAt" TIMESTAMP(3),
  "sourceSubscriptionId" TEXT,
  "recalculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DealerEntitlement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "NotificationEventPreference" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "eventType" "NotificationEventType" NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationEventPreference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ProductPolicy" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "valueJson" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedBy" TEXT,
  CONSTRAINT "ProductPolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AppVersionPolicy" (
  "id" TEXT NOT NULL,
  "platform" "ClientPlatform" NOT NULL,
  "latestVersion" TEXT,
  "minimumSupportedVersion" TEXT,
  "updateMessageHe" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AppVersionPolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "IdentityLinkChallenge" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" "IdentityProvider" NOT NULL,
  "providerSubject" TEXT,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IdentityLinkChallenge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ExternalIdentity_provider_providerSubject_key" ON "ExternalIdentity"("provider", "providerSubject");
CREATE INDEX IF NOT EXISTS "ExternalIdentity_userId_idx" ON "ExternalIdentity"("userId");
CREATE INDEX IF NOT EXISTS "ExternalIdentity_verifiedEmail_idx" ON "ExternalIdentity"("verifiedEmail");
CREATE UNIQUE INDEX IF NOT EXISTS "DeviceInstallation_installationId_key" ON "DeviceInstallation"("installationId");
CREATE INDEX IF NOT EXISTS "DeviceInstallation_userId_revokedAt_idx" ON "DeviceInstallation"("userId", "revokedAt");
CREATE INDEX IF NOT EXISTS "DeviceInstallation_dealerId_idx" ON "DeviceInstallation"("dealerId");
CREATE INDEX IF NOT EXISTS "DeviceInstallation_pushToken_idx" ON "DeviceInstallation"("pushToken");
CREATE UNIQUE INDEX IF NOT EXISTS "SubscriptionPlan_slug_key" ON "SubscriptionPlan"("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "ProviderProduct_provider_externalProductId_environment_key" ON "ProviderProduct"("provider", "externalProductId", "environment");
CREATE INDEX IF NOT EXISTS "ProviderProduct_planId_idx" ON "ProviderProduct"("planId");
CREATE UNIQUE INDEX IF NOT EXISTS "DealerSubscription_provider_externalSubscriptionId_key" ON "DealerSubscription"("provider", "externalSubscriptionId");
CREATE INDEX IF NOT EXISTS "DealerSubscription_dealerId_status_idx" ON "DealerSubscription"("dealerId", "status");
CREATE INDEX IF NOT EXISTS "DealerSubscription_purchaserUserId_idx" ON "DealerSubscription"("purchaserUserId");
CREATE UNIQUE INDEX IF NOT EXISTS "ProviderTransaction_provider_externalTransactionId_eventType_key" ON "ProviderTransaction"("provider", "externalTransactionId", "eventType");
CREATE INDEX IF NOT EXISTS "ProviderTransaction_dealerId_createdAt_idx" ON "ProviderTransaction"("dealerId", "createdAt");
CREATE INDEX IF NOT EXISTS "ProviderTransaction_subscriptionId_idx" ON "ProviderTransaction"("subscriptionId");
CREATE UNIQUE INDEX IF NOT EXISTS "DealerEntitlement_dealerId_key" ON "DealerEntitlement"("dealerId");
CREATE UNIQUE INDEX IF NOT EXISTS "NotificationEventPreference_userId_eventType_key" ON "NotificationEventPreference"("userId", "eventType");
CREATE INDEX IF NOT EXISTS "NotificationEventPreference_userId_idx" ON "NotificationEventPreference"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "ProductPolicy_key_key" ON "ProductPolicy"("key");
CREATE UNIQUE INDEX IF NOT EXISTS "AppVersionPolicy_platform_key" ON "AppVersionPolicy"("platform");
CREATE UNIQUE INDEX IF NOT EXISTS "IdentityLinkChallenge_tokenHash_key" ON "IdentityLinkChallenge"("tokenHash");
CREATE INDEX IF NOT EXISTS "IdentityLinkChallenge_userId_provider_idx" ON "IdentityLinkChallenge"("userId", "provider");

ALTER TABLE "ExternalIdentity" DROP CONSTRAINT IF EXISTS "ExternalIdentity_userId_fkey";
ALTER TABLE "ExternalIdentity" ADD CONSTRAINT "ExternalIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DeviceInstallation" DROP CONSTRAINT IF EXISTS "DeviceInstallation_userId_fkey";
ALTER TABLE "DeviceInstallation" ADD CONSTRAINT "DeviceInstallation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DeviceInstallation" DROP CONSTRAINT IF EXISTS "DeviceInstallation_dealerId_fkey";
ALTER TABLE "DeviceInstallation" ADD CONSTRAINT "DeviceInstallation_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProviderProduct" DROP CONSTRAINT IF EXISTS "ProviderProduct_planId_fkey";
ALTER TABLE "ProviderProduct" ADD CONSTRAINT "ProviderProduct_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DealerSubscription" DROP CONSTRAINT IF EXISTS "DealerSubscription_dealerId_fkey";
ALTER TABLE "DealerSubscription" ADD CONSTRAINT "DealerSubscription_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DealerSubscription" DROP CONSTRAINT IF EXISTS "DealerSubscription_planId_fkey";
ALTER TABLE "DealerSubscription" ADD CONSTRAINT "DealerSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DealerSubscription" DROP CONSTRAINT IF EXISTS "DealerSubscription_purchaserUserId_fkey";
ALTER TABLE "DealerSubscription" ADD CONSTRAINT "DealerSubscription_purchaserUserId_fkey" FOREIGN KEY ("purchaserUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProviderTransaction" DROP CONSTRAINT IF EXISTS "ProviderTransaction_subscriptionId_fkey";
ALTER TABLE "ProviderTransaction" ADD CONSTRAINT "ProviderTransaction_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "DealerSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DealerEntitlement" DROP CONSTRAINT IF EXISTS "DealerEntitlement_dealerId_fkey";
ALTER TABLE "DealerEntitlement" ADD CONSTRAINT "DealerEntitlement_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NotificationEventPreference" DROP CONSTRAINT IF EXISTS "NotificationEventPreference_userId_fkey";
ALTER TABLE "NotificationEventPreference" ADD CONSTRAINT "NotificationEventPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill entitlements for existing dealers (FREE, no trial start)
INSERT INTO "DealerEntitlement" ("id", "dealerId", "status", "trialEligible", "foundingDealer", "recalculatedAt", "createdAt", "updatedAt")
SELECT md5(random()::text || clock_timestamp()::text), d."id", 'FREE', true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Dealer" d
WHERE NOT EXISTS (SELECT 1 FROM "DealerEntitlement" e WHERE e."dealerId" = d."id");

-- Seed default product policies (monetization OFF)
INSERT INTO "ProductPolicy" ("id", "key", "valueJson", "updatedAt", "createdAt")
VALUES
  (md5(random()::text || '1'), 'MONETIZATION_ENABLED', 'false'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (md5(random()::text || '2'), 'TRIAL_ENABLED', 'false'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (md5(random()::text || '3'), 'NATIVE_PUSH_ENABLED', 'false'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

-- Seed placeholder subscription plan (no prices)
INSERT INTO "SubscriptionPlan" ("id", "slug", "nameHe", "description", "active", "createdAt", "updatedAt")
VALUES (md5(random()::text || 'plan'), 'exchange_standard', 'REMATCHER Exchange', 'תוכנית סטנדרטית — מחיר מהחנות בלבד', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;
