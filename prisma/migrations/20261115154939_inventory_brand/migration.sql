-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN     "brandId" TEXT;

-- CreateIndex
CREATE INDEX "InventoryItem_brandId_idx" ON "InventoryItem"("brandId");

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

