-- ConversationTurn: atomic clientTurnId claim for concurrent idempotency
CREATE TYPE "ConversationTurnStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');

CREATE TABLE "ConversationTurn" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "clientTurnId" TEXT NOT NULL,
    "requestFingerprint" TEXT NOT NULL,
    "status" "ConversationTurnStatus" NOT NULL DEFAULT 'PROCESSING',
    "resultJson" JSONB,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseExpiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationTurn_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConversationTurn_threadId_clientTurnId_key" ON "ConversationTurn"("threadId", "clientTurnId");

CREATE INDEX "ConversationTurn_threadId_status_leaseExpiresAt_idx" ON "ConversationTurn"("threadId", "status", "leaseExpiresAt");

ALTER TABLE "ConversationTurn" ADD CONSTRAINT "ConversationTurn_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ConversationThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
