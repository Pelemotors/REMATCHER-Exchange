-- CreateEnum
CREATE TYPE "DealerMemoryKind" AS ENUM ('PROFILE', 'PREFERENCE', 'GOAL', 'BUSINESS_CONTEXT', 'DECISION', 'TEMPORARY');

-- CreateEnum
CREATE TYPE "DealerMemoryStatus" AS ENUM ('ACTIVE', 'SUPERSEDED', 'EXPIRED', 'FORGOTTEN');

-- CreateEnum
CREATE TYPE "DealerMemoryProvenance" AS ENUM ('USER_STATED', 'AGENT_INFERRED', 'SYSTEM_DERIVED');

-- CreateTable
CREATE TABLE "DealerMemoryItem" (
    "id" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "topicKey" TEXT NOT NULL,
    "kind" "DealerMemoryKind" NOT NULL,
    "status" "DealerMemoryStatus" NOT NULL DEFAULT 'ACTIVE',
    "provenance" "DealerMemoryProvenance" NOT NULL,
    "summary" TEXT NOT NULL,
    "details" JSONB,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "evidenceNote" TEXT,
    "expiresAt" TIMESTAMP(3),
    "supersedesId" TEXT,
    "forgottenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealerMemoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DealerMemoryItem_dealerId_status_idx" ON "DealerMemoryItem"("dealerId", "status");

-- CreateIndex
CREATE INDEX "DealerMemoryItem_dealerId_topicKey_status_idx" ON "DealerMemoryItem"("dealerId", "topicKey", "status");

-- CreateIndex
CREATE INDEX "DealerMemoryItem_dealerId_expiresAt_idx" ON "DealerMemoryItem"("dealerId", "expiresAt");

-- AddForeignKey
ALTER TABLE "DealerMemoryItem" ADD CONSTRAINT "DealerMemoryItem_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealerMemoryItem" ADD CONSTRAINT "DealerMemoryItem_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "DealerMemoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
