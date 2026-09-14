-- CreateEnum
CREATE TYPE "VehicleMediaType" AS ENUM ('IMAGE');

-- CreateEnum
CREATE TYPE "VehicleMediaCategory" AS ENUM ('EXTERIOR', 'INTERIOR', 'OTHER');

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN "mediaReady" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "VehicleMedia" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "type" "VehicleMediaType" NOT NULL DEFAULT 'IMAGE',
    "category" "VehicleMediaCategory" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "bytes" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleMedia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VehicleMedia_vehicleId_category_idx" ON "VehicleMedia"("vehicleId", "category");

-- CreateIndex
CREATE INDEX "VehicleMedia_vehicleId_isPrimary_idx" ON "VehicleMedia"("vehicleId", "isPrimary");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleMedia_storageKey_key" ON "VehicleMedia"("storageKey");

-- AddForeignKey
ALTER TABLE "VehicleMedia" ADD CONSTRAINT "VehicleMedia_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
