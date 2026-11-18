-- CreateEnum
CREATE TYPE "TourStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'READY_FOR_MARKETPLACE', 'PUBLISHED', 'ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TourType" AS ENUM ('PRIVATE', 'GROUP');

-- CreateTable
CREATE TABLE "Tour" (
    "id" TEXT NOT NULL,
    "internalCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "destination" TEXT,
    "country" TEXT,
    "city" TEXT,
    "durationMinutes" INTEGER,
    "description" TEXT,
    "highlights" TEXT,
    "includedItems" TEXT,
    "excludedItems" TEXT,
    "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tourType" "TourType" NOT NULL DEFAULT 'GROUP',
    "minParticipants" INTEGER,
    "maxParticipants" INTEGER,
    "meetingPoint" TEXT,
    "pickupInfo" TEXT,
    "cancellationPolicy" TEXT,
    "importantInfo" TEXT,
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "priceAdult" DOUBLE PRECISION,
    "priceChild" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'LKR',
    "operatingDays" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "startingTimes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "TourStatus" NOT NULL DEFAULT 'DRAFT',
    "branchId" TEXT,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "internalNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Tour_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tour_internalCode_key" ON "Tour"("internalCode");

-- CreateIndex
CREATE INDEX "Tour_branchId_idx" ON "Tour"("branchId");

-- CreateIndex
CREATE INDEX "Tour_status_idx" ON "Tour"("status");

-- AddForeignKey
ALTER TABLE "Tour" ADD CONSTRAINT "Tour_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tour" ADD CONSTRAINT "Tour_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tour" ADD CONSTRAINT "Tour_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

