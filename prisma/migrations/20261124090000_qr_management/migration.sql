-- CreateEnum
CREATE TYPE "QRTargetType" AS ENUM ('PRODUCT', 'GEMSTONE', 'CERTIFICATE', 'BOUTIQUE', 'TRAVEL_EXPERIENCE', 'CAMPAIGN');

-- CreateTable
CREATE TABLE "QRCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "targetType" "QRTargetType" NOT NULL,
    "targetId" TEXT,
    "externalUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QRCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QRScan" (
    "id" TEXT NOT NULL,
    "qrCodeId" TEXT NOT NULL,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "referrer" TEXT,

    CONSTRAINT "QRScan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QRCode_code_key" ON "QRCode"("code");

-- CreateIndex
CREATE INDEX "QRCode_createdById_idx" ON "QRCode"("createdById");

-- CreateIndex
CREATE INDEX "QRCode_targetType_targetId_idx" ON "QRCode"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "QRScan_qrCodeId_idx" ON "QRScan"("qrCodeId");

-- CreateIndex
CREATE INDEX "QRScan_scannedAt_idx" ON "QRScan"("scannedAt");

-- AddForeignKey
ALTER TABLE "QRCode" ADD CONSTRAINT "QRCode_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QRScan" ADD CONSTRAINT "QRScan_qrCodeId_fkey" FOREIGN KEY ("qrCodeId") REFERENCES "QRCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

