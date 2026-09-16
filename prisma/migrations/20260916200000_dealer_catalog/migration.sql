-- Digital Dealer Catalog: public storefront separate from VehicleVisibility

CREATE TYPE "CatalogStatus" AS ENUM ('DRAFT', 'ENABLED', 'DISABLED');

CREATE TABLE "DealerCatalog" (
    "id" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "status" "CatalogStatus" NOT NULL DEFAULT 'DRAFT',
    "phone" TEXT,
    "whatsapp" TEXT,
    "address" TEXT,
    "description" TEXT,
    "logoUrl" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealerCatalog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DealerCatalog_dealerId_key" ON "DealerCatalog"("dealerId");
CREATE UNIQUE INDEX "DealerCatalog_slug_key" ON "DealerCatalog"("slug");
CREATE INDEX "DealerCatalog_status_slug_idx" ON "DealerCatalog"("status", "slug");

ALTER TABLE "DealerCatalog" ADD CONSTRAINT "DealerCatalog_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CatalogPublication" (
    "id" TEXT NOT NULL,
    "catalogId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unpublishedAt" TIMESTAMP(3),

    CONSTRAINT "CatalogPublication_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CatalogPublication_catalogId_vehicleId_key" ON "CatalogPublication"("catalogId", "vehicleId");
CREATE INDEX "CatalogPublication_catalogId_isActive_publishedAt_idx" ON "CatalogPublication"("catalogId", "isActive", "publishedAt" DESC);
CREATE INDEX "CatalogPublication_vehicleId_isActive_idx" ON "CatalogPublication"("vehicleId", "isActive");

ALTER TABLE "CatalogPublication" ADD CONSTRAINT "CatalogPublication_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "DealerCatalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CatalogPublication" ADD CONSTRAINT "CatalogPublication_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
