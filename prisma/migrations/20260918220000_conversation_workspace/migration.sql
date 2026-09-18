-- CreateEnum
CREATE TYPE "ConversationTitleSource" AS ENUM ('AUTO', 'USER');

-- CreateEnum
CREATE TYPE "ConversationThreadStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'DELETED');

-- CreateEnum
CREATE TYPE "ConversationThreadSource" AS ENUM ('AGENT', 'HOME_CAPTURE', 'IOS_SHARE', 'CAMERA', 'PHOTO_LIBRARY', 'TEXT', 'CUSTOMER_SCREENSHOT', 'OTHER');

-- CreateEnum
CREATE TYPE "ConversationVisibility" AS ENUM ('PRIVATE_USER', 'DEALER_SHARED');

-- CreateEnum
CREATE TYPE "ConversationMessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ConversationMessageKind" AS ENUM ('TEXT', 'MEDIA_GROUP', 'VEHICLE_CANDIDATE', 'DEMAND_DRAFT', 'CUSTOMER_CARD', 'INTELLIGENCE_RESULT', 'ACTION_CONFIRMATION', 'ACTION_RESULT', 'STATUS', 'ERROR');

-- CreateEnum
CREATE TYPE "ConversationActionStatus" AS ENUM ('PROPOSED', 'PENDING_CONFIRMATION', 'EXECUTING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "ConversationThread" (
    "id" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'שיחה חדשה',
    "titleSource" "ConversationTitleSource" NOT NULL DEFAULT 'AUTO',
    "status" "ConversationThreadStatus" NOT NULL DEFAULT 'ACTIVE',
    "source" "ConversationThreadSource" NOT NULL DEFAULT 'OTHER',
    "visibility" "ConversationVisibility" NOT NULL DEFAULT 'PRIVATE_USER',
    "agentStateJson" JSONB,
    "compactSummary" TEXT,
    "lastMessageAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "role" "ConversationMessageRole" NOT NULL,
    "kind" "ConversationMessageKind" NOT NULL DEFAULT 'TEXT',
    "text" TEXT,
    "payloadJson" JSONB,
    "entityType" TEXT,
    "entityId" TEXT,
    "intakeBatchId" TEXT,
    "source" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationAction" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "messageId" TEXT,
    "actionType" TEXT NOT NULL,
    "status" "ConversationActionStatus" NOT NULL DEFAULT 'PROPOSED',
    "payloadJson" JSONB,
    "resultJson" JSONB,
    "idempotencyKey" TEXT,
    "gatewayActionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationAction_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "IntakeBatch" ADD COLUMN "conversationThreadId" TEXT;

-- CreateIndex
CREATE INDEX "ConversationThread_dealerId_ownerUserId_status_lastMessageAt_idx" ON "ConversationThread"("dealerId", "ownerUserId", "status", "lastMessageAt" DESC);

-- CreateIndex
CREATE INDEX "ConversationThread_dealerId_status_idx" ON "ConversationThread"("dealerId", "status");

-- CreateIndex
CREATE INDEX "ConversationMessage_threadId_createdAt_idx" ON "ConversationMessage"("threadId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationMessage_threadId_idempotencyKey_key" ON "ConversationMessage"("threadId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationAction_threadId_idempotencyKey_key" ON "ConversationAction"("threadId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "ConversationAction_threadId_status_updatedAt_idx" ON "ConversationAction"("threadId", "status", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "IntakeBatch_conversationThreadId_idx" ON "IntakeBatch"("conversationThreadId");

-- AddForeignKey
ALTER TABLE "IntakeBatch" ADD CONSTRAINT "IntakeBatch_conversationThreadId_fkey" FOREIGN KEY ("conversationThreadId") REFERENCES "ConversationThread"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationThread" ADD CONSTRAINT "ConversationThread_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationThread" ADD CONSTRAINT "ConversationThread_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMessage" ADD CONSTRAINT "ConversationMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ConversationThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationAction" ADD CONSTRAINT "ConversationAction_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ConversationThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
