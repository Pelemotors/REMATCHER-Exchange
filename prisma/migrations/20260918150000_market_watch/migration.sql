-- CreateTable
CREATE TABLE "MarketWatch" (
    "id" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "userId" TEXT,
    "queryMake" TEXT NOT NULL,
    "queryModel" TEXT NOT NULL,
    "yearMin" INTEGER,
    "yearMax" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastEvaluatedAt" TIMESTAMP(3),
    "lastFingerprint" TEXT,
    "lastNotifiedAt" TIMESTAMP(3),

    CONSTRAINT "MarketWatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketWatch_dealerId_active_idx" ON "MarketWatch"("dealerId", "active");

-- CreateIndex
CREATE INDEX "MarketWatch_active_lastEvaluatedAt_idx" ON "MarketWatch"("active", "lastEvaluatedAt");

-- AddForeignKey
ALTER TABLE "MarketWatch" ADD CONSTRAINT "MarketWatch_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketWatch" ADD CONSTRAINT "MarketWatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
