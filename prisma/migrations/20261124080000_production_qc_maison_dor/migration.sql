-- CreateEnum
CREATE TYPE "MetalType" AS ENUM ('GOLD', 'SILVER', 'PALLADIUM', 'OTHER');

-- CreateEnum
CREATE TYPE "QCDecision" AS ENUM ('PASS', 'FAIL', 'NA');

-- CreateEnum
CREATE TYPE "CertificateVerificationStatus" AS ENUM ('UNVERIFIED', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ToolCondition" AS ENUM ('GOOD', 'DAMAGED', 'MISSING', 'UNDER_MAINTENANCE');

-- CreateEnum
CREATE TYPE "SupplyCategory" AS ENUM ('OFFICE_SUPPLY', 'JEWELLERY_BOX', 'PACKAGING', 'CONSUMABLE');

-- AlterTable
ALTER TABLE "Brand" ADD COLUMN     "requiresGoldCertificates" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "OrderMetalSpec" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "metalType" "MetalType" NOT NULL,
    "purity" TEXT,
    "estimatedWeightGrams" DOUBLE PRECISION,
    "actualWeightGrams" DOUBLE PRECISION,
    "wastageGrams" DOUBLE PRECISION,
    "scrapRecoveredGrams" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderMetalSpec_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderGemstoneSpec" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "gemstoneType" TEXT NOT NULL,
    "caratWeight" DOUBLE PRECISION,
    "dimensions" TEXT,
    "cut" TEXT,
    "color" TEXT,
    "clarity" TEXT,
    "origin" TEXT,
    "treatment" TEXT,
    "certificateNumber" TEXT,
    "certificateDocUrl" TEXT,
    "supplierId" TEXT,
    "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderGemstoneSpec_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderComponent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "estimatedQty" INTEGER,
    "actualQty" INTEGER,
    "unit" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QCChecklistTemplate" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QCChecklistTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QCInspection" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "inspectorId" TEXT NOT NULL,
    "decision" "QCDecision" NOT NULL,
    "generalNotes" TEXT,
    "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QCInspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QCChecklistResult" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "templateId" TEXT,
    "label" TEXT NOT NULL,
    "result" "QCDecision" NOT NULL,
    "comment" TEXT,
    "photoUrl" TEXT,

    CONSTRAINT "QCChecklistResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoldCertificate" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "certificateNumber" TEXT NOT NULL,
    "issuingAuthority" TEXT,
    "documentUrl" TEXT,
    "goldSpecification" TEXT,
    "verificationStatus" "CertificateVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoldCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderHandover" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "fromStaffId" TEXT,
    "toStaffId" TEXT NOT NULL,
    "handoverAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "materialsNote" TEXT,
    "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "acknowledgedAt" TIMESTAMP(3),

    CONSTRAINT "OrderHandover_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkshopTool" (
    "id" TEXT NOT NULL,
    "toolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "assignedStaffId" TEXT,
    "issueDate" TIMESTAMP(3),
    "expectedReturnDate" TIMESTAMP(3),
    "returnDate" TIMESTAMP(3),
    "condition" "ToolCondition" NOT NULL DEFAULT 'GOOD',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkshopTool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToolMaintenanceLog" (
    "id" TEXT NOT NULL,
    "toolId" TEXT NOT NULL,
    "loggedById" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT NOT NULL,
    "cost" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ToolMaintenanceLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplyItem" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "SupplyCategory" NOT NULL,
    "unit" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "minimumStock" INTEGER NOT NULL DEFAULT 0,
    "purchasePrice" DOUBLE PRECISION,
    "storageLocation" TEXT,
    "branchId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplyItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplyIssue" (
    "id" TEXT NOT NULL,
    "supplyItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "issuedToStaffId" TEXT,
    "orderId" TEXT,
    "reason" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplyIssue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderMetalSpec_orderId_idx" ON "OrderMetalSpec"("orderId");

-- CreateIndex
CREATE INDEX "OrderGemstoneSpec_orderId_idx" ON "OrderGemstoneSpec"("orderId");

-- CreateIndex
CREATE INDEX "OrderGemstoneSpec_supplierId_idx" ON "OrderGemstoneSpec"("supplierId");

-- CreateIndex
CREATE INDEX "OrderComponent_orderId_idx" ON "OrderComponent"("orderId");

-- CreateIndex
CREATE INDEX "QCInspection_orderId_idx" ON "QCInspection"("orderId");

-- CreateIndex
CREATE INDEX "QCInspection_inspectorId_idx" ON "QCInspection"("inspectorId");

-- CreateIndex
CREATE INDEX "QCChecklistResult_inspectionId_idx" ON "QCChecklistResult"("inspectionId");

-- CreateIndex
CREATE INDEX "GoldCertificate_orderId_idx" ON "GoldCertificate"("orderId");

-- CreateIndex
CREATE INDEX "OrderHandover_orderId_idx" ON "OrderHandover"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkshopTool_toolId_key" ON "WorkshopTool"("toolId");

-- CreateIndex
CREATE INDEX "WorkshopTool_assignedStaffId_idx" ON "WorkshopTool"("assignedStaffId");

-- CreateIndex
CREATE INDEX "ToolMaintenanceLog_toolId_idx" ON "ToolMaintenanceLog"("toolId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplyItem_sku_key" ON "SupplyItem"("sku");

-- CreateIndex
CREATE INDEX "SupplyItem_branchId_idx" ON "SupplyItem"("branchId");

-- CreateIndex
CREATE INDEX "SupplyItem_category_idx" ON "SupplyItem"("category");

-- CreateIndex
CREATE INDEX "SupplyIssue_supplyItemId_idx" ON "SupplyIssue"("supplyItemId");

-- CreateIndex
CREATE INDEX "SupplyIssue_orderId_idx" ON "SupplyIssue"("orderId");

-- AddForeignKey
ALTER TABLE "OrderMetalSpec" ADD CONSTRAINT "OrderMetalSpec_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderGemstoneSpec" ADD CONSTRAINT "OrderGemstoneSpec_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderGemstoneSpec" ADD CONSTRAINT "OrderGemstoneSpec_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderComponent" ADD CONSTRAINT "OrderComponent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QCInspection" ADD CONSTRAINT "QCInspection_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QCInspection" ADD CONSTRAINT "QCInspection_inspectorId_fkey" FOREIGN KEY ("inspectorId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QCChecklistResult" ADD CONSTRAINT "QCChecklistResult_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "QCInspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QCChecklistResult" ADD CONSTRAINT "QCChecklistResult_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "QCChecklistTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoldCertificate" ADD CONSTRAINT "GoldCertificate_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoldCertificate" ADD CONSTRAINT "GoldCertificate_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderHandover" ADD CONSTRAINT "OrderHandover_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderHandover" ADD CONSTRAINT "OrderHandover_fromStaffId_fkey" FOREIGN KEY ("fromStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderHandover" ADD CONSTRAINT "OrderHandover_toStaffId_fkey" FOREIGN KEY ("toStaffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopTool" ADD CONSTRAINT "WorkshopTool_assignedStaffId_fkey" FOREIGN KEY ("assignedStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolMaintenanceLog" ADD CONSTRAINT "ToolMaintenanceLog_toolId_fkey" FOREIGN KEY ("toolId") REFERENCES "WorkshopTool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolMaintenanceLog" ADD CONSTRAINT "ToolMaintenanceLog_loggedById_fkey" FOREIGN KEY ("loggedById") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyItem" ADD CONSTRAINT "SupplyItem_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyIssue" ADD CONSTRAINT "SupplyIssue_supplyItemId_fkey" FOREIGN KEY ("supplyItemId") REFERENCES "SupplyItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyIssue" ADD CONSTRAINT "SupplyIssue_issuedToStaffId_fkey" FOREIGN KEY ("issuedToStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyIssue" ADD CONSTRAINT "SupplyIssue_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

