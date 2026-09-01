-- Signup & email verification
ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);

ALTER TABLE "Dealer" ADD COLUMN "businessId" TEXT;
ALTER TABLE "Dealer" ADD COLUMN "rejectionReason" TEXT;

CREATE TABLE "VerificationToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VerificationToken_tokenHash_key" ON "VerificationToken"("tokenHash");
CREATE INDEX "VerificationToken_userId_type_idx" ON "VerificationToken"("userId", "type");

ALTER TABLE "VerificationToken" ADD CONSTRAINT "VerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing users treated as email-verified
UPDATE "User" SET "emailVerifiedAt" = NOW() WHERE "emailVerifiedAt" IS NULL;

-- NotificationType enum extension
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'DEALER_VERIFICATION';
