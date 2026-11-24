-- AlterTable
ALTER TABLE "RepairOrder" ADD COLUMN     "assignedSalesId" TEXT;

-- CreateIndex
CREATE INDEX "RepairOrder_assignedSalesId_idx" ON "RepairOrder"("assignedSalesId");

-- AddForeignKey
ALTER TABLE "RepairOrder" ADD CONSTRAINT "RepairOrder_assignedSalesId_fkey" FOREIGN KEY ("assignedSalesId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
