-- CreateEnum
CREATE TYPE "CustomerStage" AS ENUM ('LEAD', 'PROSPECT', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "CustomerActivityType" AS ENUM ('CALL', 'VISIT', 'STAGE_CHANGE');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'CUSTOMER_FOLLOWUP';

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "stage" "CustomerStage" NOT NULL DEFAULT 'CUSTOMER',
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "CustomerNote" ADD COLUMN     "followUpDone" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CustomerActivity" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" "CustomerActivityType" NOT NULL,
    "note" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerActivity_customerId_idx" ON "CustomerActivity"("customerId");

-- AddForeignKey
ALTER TABLE "CustomerActivity" ADD CONSTRAINT "CustomerActivity_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerActivity" ADD CONSTRAINT "CustomerActivity_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

