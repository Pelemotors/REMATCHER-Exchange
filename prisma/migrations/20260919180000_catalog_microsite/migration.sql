-- Digital catalog micro-site: branding, opaque publicId, leads, events.

ALTER TABLE "DealerCatalog" ADD COLUMN "coverImageUrl" TEXT;
ALTER TABLE "DealerCatalog" ADD COLUMN "themeKey" TEXT DEFAULT 'MIDNIGHT_GOLD';
ALTER TABLE "DealerCatalog" ADD COLUMN "openingHoursJson" JSONB;
ALTER TABLE "DealerCatalog" ADD COLUMN "allowSearchIndexing" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DealerCatalog" ADD COLUMN "cityLabel" TEXT;

ALTER TABLE "CatalogPublication" ADD COLUMN "publicId" TEXT;
ALTER TABLE "CatalogPublication" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CatalogPublication" ADD COLUMN "showPrice" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "CatalogPublication" ADD COLUMN "publicDescription" TEXT;

-- Deterministic opaque id from existing row identity (no cuid() in SQL).
UPDATE "CatalogPublication"
SET "publicId" = md5("id")
WHERE "publicId" IS NULL;

ALTER TABLE "CatalogPublication" ALTER COLUMN "publicId" SET NOT NULL;
CREATE UNIQUE INDEX "CatalogPublication_publicId_key" ON "CatalogPublication"("publicId");

CREATE TYPE "CatalogLeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'CLOSED', 'SPAM');

CREATE TABLE "CatalogLead" (
    "id" TEXT NOT NULL,
    "catalogId" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "publicationId" TEXT,
    "vehicleId" TEXT,
    "customerId" TEXT,
    "name" TEXT NOT NULL,
    "rawPhone" TEXT NOT NULL,
    "normalizedPhone" TEXT NOT NULL,
    "message" TEXT,
    "source" TEXT NOT NULL DEFAULT 'PUBLIC_FORM',
    "status" "CatalogLeadStatus" NOT NULL DEFAULT 'NEW',
    "clientSubmissionId" TEXT NOT NULL,
    "consentVersion" TEXT,
    "consentedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogLead_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CatalogLead_clientSubmissionId_key" ON "CatalogLead"("clientSubmissionId");
CREATE INDEX "CatalogLead_catalogId_createdAt_idx" ON "CatalogLead"("catalogId", "createdAt" DESC);
CREATE INDEX "CatalogLead_dealerId_status_createdAt_idx" ON "CatalogLead"("dealerId", "status", "createdAt" DESC);
CREATE INDEX "CatalogLead_normalizedPhone_catalogId_createdAt_idx" ON "CatalogLead"("normalizedPhone", "catalogId", "createdAt" DESC);

ALTER TABLE "CatalogLead" ADD CONSTRAINT "CatalogLead_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "DealerCatalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CatalogLead" ADD CONSTRAINT "CatalogLead_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "CatalogPublication"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CatalogLead" ADD CONSTRAINT "CatalogLead_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "CatalogEvent" (
    "id" TEXT NOT NULL,
    "clientEventId" TEXT,
    "catalogId" TEXT NOT NULL,
    "publicationId" TEXT,
    "vehicleId" TEXT,
    "eventType" TEXT NOT NULL,
    "sessionHash" TEXT,
    "referrerHost" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CatalogEvent_clientEventId_key" ON "CatalogEvent"("clientEventId");
CREATE INDEX "CatalogEvent_catalogId_eventType_createdAt_idx" ON "CatalogEvent"("catalogId", "eventType", "createdAt");
CREATE INDEX "CatalogEvent_catalogId_createdAt_idx" ON "CatalogEvent"("catalogId", "createdAt");

ALTER TABLE "CatalogEvent" ADD CONSTRAINT "CatalogEvent_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "DealerCatalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CatalogEvent" ADD CONSTRAINT "CatalogEvent_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "CatalogPublication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TYPE "NotificationType" ADD VALUE 'CATALOG_LEAD';
