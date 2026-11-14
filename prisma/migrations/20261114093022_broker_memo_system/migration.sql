-- CreateEnum
CREATE TYPE "MemoStatus" AS ENUM ('OPEN', 'PARTIALLY_RETURNED', 'RETURNED');

-- CreateEnum
CREATE TYPE "MemoEditRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'MEMO_EDIT_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE 'MEMO_EDIT_DECIDED';

-- CreateTable
CREATE TABLE "Broker" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "branchId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Broker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrokerMemo" (
    "id" TEXT NOT NULL,
    "memoNumber" TEXT NOT NULL,
    "brokerId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "status" "MemoStatus" NOT NULL DEFAULT 'OPEN',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedReturnAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrokerMemo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrokerMemoItem" (
    "id" TEXT NOT NULL,
    "memoId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "returnedQuantity" INTEGER NOT NULL DEFAULT 0,
    "valueEach" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "BrokerMemoItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrokerMemoEditRequest" (
    "id" TEXT NOT NULL,
    "memoId" TEXT NOT NULL,
    "status" "MemoEditRequestStatus" NOT NULL DEFAULT 'PENDING',
    "itemReturns" JSONB NOT NULL,
    "notesChange" TEXT,
    "reason" TEXT,
    "requestedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrokerMemoEditRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Broker_branchId_idx" ON "Broker"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "BrokerMemo_memoNumber_key" ON "BrokerMemo"("memoNumber");

-- CreateIndex
CREATE INDEX "BrokerMemo_brokerId_idx" ON "BrokerMemo"("brokerId");

-- CreateIndex
CREATE INDEX "BrokerMemo_branchId_idx" ON "BrokerMemo"("branchId");

-- CreateIndex
CREATE INDEX "BrokerMemoItem_memoId_idx" ON "BrokerMemoItem"("memoId");

-- CreateIndex
CREATE INDEX "BrokerMemoEditRequest_memoId_idx" ON "BrokerMemoEditRequest"("memoId");

-- AddForeignKey
ALTER TABLE "Broker" ADD CONSTRAINT "Broker_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Broker" ADD CONSTRAINT "Broker_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrokerMemo" ADD CONSTRAINT "BrokerMemo_brokerId_fkey" FOREIGN KEY ("brokerId") REFERENCES "Broker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrokerMemo" ADD CONSTRAINT "BrokerMemo_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrokerMemo" ADD CONSTRAINT "BrokerMemo_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrokerMemoItem" ADD CONSTRAINT "BrokerMemoItem_memoId_fkey" FOREIGN KEY ("memoId") REFERENCES "BrokerMemo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrokerMemoItem" ADD CONSTRAINT "BrokerMemoItem_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrokerMemoEditRequest" ADD CONSTRAINT "BrokerMemoEditRequest_memoId_fkey" FOREIGN KEY ("memoId") REFERENCES "BrokerMemo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrokerMemoEditRequest" ADD CONSTRAINT "BrokerMemoEditRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrokerMemoEditRequest" ADD CONSTRAINT "BrokerMemoEditRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
