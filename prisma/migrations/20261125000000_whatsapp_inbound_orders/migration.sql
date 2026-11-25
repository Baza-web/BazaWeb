-- CreateEnum
CREATE TYPE "WhatsAppOrderStatus" AS ENUM ('PENDING', 'CONVERTED', 'DISMISSED');

-- CreateTable
CREATE TABLE "WhatsAppInboundOrder" (
    "id" TEXT NOT NULL,
    "fromPhone" TEXT NOT NULL,
    "waMessageId" TEXT NOT NULL,
    "messageType" TEXT NOT NULL,
    "rawText" TEXT,
    "mediaPath" TEXT,
    "externalOrderNumber" TEXT,
    "customerNameGuess" TEXT,
    "extractedJson" JSONB NOT NULL,
    "status" "WhatsAppOrderStatus" NOT NULL DEFAULT 'PENDING',
    "saleId" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppInboundOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppInboundOrder_waMessageId_key" ON "WhatsAppInboundOrder"("waMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppInboundOrder_saleId_key" ON "WhatsAppInboundOrder"("saleId");

-- CreateIndex
CREATE INDEX "WhatsAppInboundOrder_status_idx" ON "WhatsAppInboundOrder"("status");

-- CreateIndex
CREATE INDEX "WhatsAppInboundOrder_fromPhone_idx" ON "WhatsAppInboundOrder"("fromPhone");

-- AddForeignKey
ALTER TABLE "WhatsAppInboundOrder" ADD CONSTRAINT "WhatsAppInboundOrder_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppInboundOrder" ADD CONSTRAINT "WhatsAppInboundOrder_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
