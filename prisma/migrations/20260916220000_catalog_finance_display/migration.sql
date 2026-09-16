-- Separate catalog finance display flag. Existing prices (b2bPrice / retailPrice) are preserved as-is.
ALTER TABLE "CatalogPublication" ADD COLUMN "showMonthlyFinance" BOOLEAN NOT NULL DEFAULT false;
