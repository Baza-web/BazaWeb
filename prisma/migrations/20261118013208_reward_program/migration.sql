-- CreateEnum
CREATE TYPE "RewardTransactionType" AS ENUM ('EARNED', 'REDEEMED', 'ADJUSTED');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "rewardBalance" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "RewardProgramSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "rewardPer100k" DOUBLE PRECISION NOT NULL DEFAULT 1000,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RewardProgramSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewardTransaction" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" "RewardTransactionType" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "saleId" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RewardTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RewardTransaction_customerId_idx" ON "RewardTransaction"("customerId");

-- CreateIndex
CREATE INDEX "RewardTransaction_saleId_idx" ON "RewardTransaction"("saleId");

-- AddForeignKey
ALTER TABLE "RewardTransaction" ADD CONSTRAINT "RewardTransaction_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardTransaction" ADD CONSTRAINT "RewardTransaction_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardTransaction" ADD CONSTRAINT "RewardTransaction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

