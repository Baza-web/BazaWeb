-- CreateEnum
CREATE TYPE "SaleUrgency" AS ENUM ('NORMAL', 'MEDIUM', 'HIGH', 'URGENT', 'CRITICAL');

-- CreateEnum
CREATE TYPE "OrderSyncStatus" AS ENUM ('PENDING', 'SYNCED', 'FAILED');

-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'PENDING_ASSIGNMENT';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "actualDeliveryDate" TIMESTAMP(3),
ADD COLUMN     "actualDispatchDate" TIMESTAMP(3),
ADD COLUMN     "courierService" TEXT,
ADD COLUMN     "deadlineNotSet" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "dispatchNotes" TEXT,
ADD COLUMN     "dispatchedById" TEXT,
ADD COLUMN     "originalSalespersonId" TEXT,
ADD COLUMN     "syncError" TEXT,
ADD COLUMN     "syncStatus" "OrderSyncStatus" NOT NULL DEFAULT 'SYNCED',
ADD COLUMN     "trackingNumber" TEXT;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "customerDeliveryInstructions" TEXT,
ADD COLUMN     "customizationRequirements" TEXT,
ADD COLUMN     "expectedDeliveryDate" TIMESTAMP(3),
ADD COLUMN     "fulfilmentInstructions" TEXT,
ADD COLUMN     "requiredDispatchDate" TIMESTAMP(3),
ADD COLUMN     "responsibleDepartment" TEXT,
ADD COLUMN     "urgency" "SaleUrgency" NOT NULL DEFAULT 'NORMAL';

-- CreateIndex
CREATE UNIQUE INDEX "Order_relatedSaleId_key" ON "Order"("relatedSaleId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_originalSalespersonId_fkey" FOREIGN KEY ("originalSalespersonId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_dispatchedById_fkey" FOREIGN KEY ("dispatchedById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

