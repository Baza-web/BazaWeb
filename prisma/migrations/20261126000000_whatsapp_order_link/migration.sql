-- AlterTable
ALTER TABLE "WhatsAppInboundOrder" ADD COLUMN     "orderId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppInboundOrder_orderId_key" ON "WhatsAppInboundOrder"("orderId");

-- AddForeignKey
ALTER TABLE "WhatsAppInboundOrder" ADD CONSTRAINT "WhatsAppInboundOrder_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
