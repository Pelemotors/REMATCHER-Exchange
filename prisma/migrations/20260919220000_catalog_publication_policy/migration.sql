-- Additive catalog automation policy. Existing catalogs stay MANUAL.
CREATE TYPE "CatalogPublicationPolicy" AS ENUM ('MANUAL', 'ALL_ELIGIBLE_ACTIVE_INVENTORY');
CREATE TYPE "CatalogVehicleOverride" AS ENUM ('DEFAULT_FROM_POLICY', 'FORCE_EXCLUDE', 'FORCE_INCLUDE');

ALTER TABLE "DealerCatalog"
ADD COLUMN "publicationPolicy" "CatalogPublicationPolicy" NOT NULL DEFAULT 'MANUAL';

ALTER TABLE "Vehicle"
ADD COLUMN "catalogOverride" "CatalogVehicleOverride" NOT NULL DEFAULT 'DEFAULT_FROM_POLICY';
