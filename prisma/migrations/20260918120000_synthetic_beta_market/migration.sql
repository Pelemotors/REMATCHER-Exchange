-- Synthetic beta market isolation flags on Dealer
CREATE TYPE "DealerMarketMode" AS ENUM ('REAL', 'SYNTHETIC');

ALTER TABLE "Dealer"
  ADD COLUMN IF NOT EXISTS "marketMode" "DealerMarketMode" NOT NULL DEFAULT 'REAL',
  ADD COLUMN IF NOT EXISTS "canAccessSyntheticMarket" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "Dealer_marketMode_idx" ON "Dealer"("marketMode");
