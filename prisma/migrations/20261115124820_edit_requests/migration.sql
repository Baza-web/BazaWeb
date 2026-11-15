-- CreateEnum
CREATE TYPE "EditRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "EditRequest" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityLabel" TEXT NOT NULL,
    "fieldSummary" TEXT NOT NULL,
    "proposedData" JSONB NOT NULL,
    "reason" TEXT,
    "status" "EditRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EditRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EditRequest_entityType_entityId_idx" ON "EditRequest"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "EditRequest" ADD CONSTRAINT "EditRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditRequest" ADD CONSTRAINT "EditRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

