-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('NEW_ORDER', 'ORDER_CONFIRMED', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_MATERIALS', 'IN_PRODUCTION', 'QUALITY_CHECK', 'REVISION_REQUIRED', 'APPROVED', 'READY_FOR_DELIVERY', 'DISPATCHED', 'DELIVERED', 'COMPLETED', 'ON_HOLD', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OrderDelayReason" AS ENUM ('WAITING_FOR_MATERIALS', 'SUPPLIER_DELAY', 'PRODUCTION_DELAY', 'DESIGN_APPROVAL_PENDING', 'CUSTOMER_CHANGES', 'QUALITY_CONTROL_ISSUE', 'STAFF_AVAILABILITY', 'OTHER');

-- CreateEnum
CREATE TYPE "OrderApprovalDecision" AS ENUM ('APPROVED', 'REVISION_REQUESTED', 'REJECTED');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "orderId" TEXT;

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "brandId" TEXT,
    "customerId" TEXT,
    "customerContact" TEXT,
    "orderType" TEXT NOT NULL,
    "productOrService" TEXT NOT NULL,
    "description" TEXT,
    "specifications" TEXT,
    "customizationRequirements" TEXT,
    "quantity" INTEGER DEFAULT 1,
    "orderValue" DOUBLE PRECISION,
    "department" TEXT,
    "orderDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "originalDeadline" TIMESTAMP(3) NOT NULL,
    "currentDeadline" TIMESTAMP(3) NOT NULL,
    "manualPriority" "TaskPriority",
    "status" "OrderStatus" NOT NULL DEFAULT 'NEW_ORDER',
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "internalInstructions" TEXT,
    "customerInstructions" TEXT,
    "referenceImages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "supportingDocuments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "branchId" TEXT,
    "primaryStaffId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "relatedSaleId" TEXT,
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderStatusHistory" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "fromStatus" "OrderStatus",
    "toStatus" "OrderStatus" NOT NULL,
    "reason" TEXT,
    "changedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderDeadlineChange" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "previousDeadline" TIMESTAMP(3) NOT NULL,
    "newDeadline" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "changedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderDeadlineChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderDelay" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "reasonType" "OrderDelayReason" NOT NULL,
    "explanation" TEXT NOT NULL,
    "reportedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderDelay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderApproval" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "decision" "OrderApprovalDecision",
    "comments" TEXT,
    "requestedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderComment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "documents" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderPrioritySettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "criticalHours" INTEGER NOT NULL DEFAULT 24,
    "highHours" INTEGER NOT NULL DEFAULT 48,
    "mediumDays" INTEGER NOT NULL DEFAULT 5,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderPrioritySettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_OrderSupportingStaff" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");

-- CreateIndex
CREATE INDEX "Order_branchId_idx" ON "Order"("branchId");

-- CreateIndex
CREATE INDEX "Order_brandId_idx" ON "Order"("brandId");

-- CreateIndex
CREATE INDEX "Order_primaryStaffId_idx" ON "Order"("primaryStaffId");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "Order_currentDeadline_idx" ON "Order"("currentDeadline");

-- CreateIndex
CREATE INDEX "OrderStatusHistory_orderId_idx" ON "OrderStatusHistory"("orderId");

-- CreateIndex
CREATE INDEX "OrderDeadlineChange_orderId_idx" ON "OrderDeadlineChange"("orderId");

-- CreateIndex
CREATE INDEX "OrderDelay_orderId_idx" ON "OrderDelay"("orderId");

-- CreateIndex
CREATE INDEX "OrderApproval_orderId_idx" ON "OrderApproval"("orderId");

-- CreateIndex
CREATE INDEX "OrderComment_orderId_idx" ON "OrderComment"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "_OrderSupportingStaff_AB_unique" ON "_OrderSupportingStaff"("A", "B");

-- CreateIndex
CREATE INDEX "_OrderSupportingStaff_B_index" ON "_OrderSupportingStaff"("B");

-- CreateIndex
CREATE INDEX "Task_orderId_idx" ON "Task"("orderId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_primaryStaffId_fkey" FOREIGN KEY ("primaryStaffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_relatedSaleId_fkey" FOREIGN KEY ("relatedSaleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderStatusHistory" ADD CONSTRAINT "OrderStatusHistory_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderStatusHistory" ADD CONSTRAINT "OrderStatusHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderDeadlineChange" ADD CONSTRAINT "OrderDeadlineChange_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderDeadlineChange" ADD CONSTRAINT "OrderDeadlineChange_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderDelay" ADD CONSTRAINT "OrderDelay_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderDelay" ADD CONSTRAINT "OrderDelay_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderApproval" ADD CONSTRAINT "OrderApproval_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderApproval" ADD CONSTRAINT "OrderApproval_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderApproval" ADD CONSTRAINT "OrderApproval_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderComment" ADD CONSTRAINT "OrderComment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderComment" ADD CONSTRAINT "OrderComment_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_OrderSupportingStaff" ADD CONSTRAINT "_OrderSupportingStaff_A_fkey" FOREIGN KEY ("A") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_OrderSupportingStaff" ADD CONSTRAINT "_OrderSupportingStaff_B_fkey" FOREIGN KEY ("B") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

