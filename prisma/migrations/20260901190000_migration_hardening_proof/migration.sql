-- Migration hardening proof: verify ALTER on existing tables works for migration role.
-- Adds and immediately removes a harmless column.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "_migrationProof" TEXT;
ALTER TABLE "User" DROP COLUMN IF EXISTS "_migrationProof";
