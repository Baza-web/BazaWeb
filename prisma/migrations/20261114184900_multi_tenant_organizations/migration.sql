-- Multi-tenant migration: introduces Organization (tenant) and backfills every
-- existing row into one default Organization so a single-business deployment
-- keeps working unchanged. All isolation between tenants happens in the
-- application (see src/lib/tenant-db.ts) + these new organizationId columns.

-- CreateEnum
CREATE TYPE "OrganizationStatus" AS ENUM ('TRIAL', 'ACTIVE', 'SUSPENDED');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "OrganizationStatus" NOT NULL DEFAULT 'TRIAL',
    "plan" TEXT NOT NULL DEFAULT 'trial',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- Seed one default Organization to own every row that already exists in this
-- database (this is a no-op, harmless insert on a brand-new database too —
-- prisma/seed.ts looks it up by slug 'default' instead of creating another).
INSERT INTO "Organization" (id, name, slug, status, plan, "createdAt", "updatedAt")
VALUES (
    'org_default',
    COALESCE((SELECT name FROM "Branch" WHERE "isMain" = true LIMIT 1), 'My Business'),
    'default',
    'ACTIVE',
    'self-hosted',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);

-- AlterTable: add organizationId as nullable first so existing rows aren't rejected
ALTER TABLE "AttendanceLog" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "Branch" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "Broker" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "BrokerMemo" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "BrokerMemoEditRequest" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "BrokerMemoItem" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "Customer" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "CustomerNote" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "Expense" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "InventoryItem" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "LeaveRequest" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "LedgerEntry" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "Message" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "Notification" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "PurchaseOrderItem" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "PushSubscription" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "RepairOrder" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "Sale" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "SaleItem" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "SalesTarget" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "Staff" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "StaffGroup" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "Task" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "TaskComment" ADD COLUMN "organizationId" TEXT;

-- Backfill: every row that already exists belongs to the default Organization
UPDATE "AttendanceLog" SET "organizationId" = 'org_default' WHERE "organizationId" IS NULL;
UPDATE "Branch" SET "organizationId" = 'org_default' WHERE "organizationId" IS NULL;
UPDATE "Broker" SET "organizationId" = 'org_default' WHERE "organizationId" IS NULL;
UPDATE "BrokerMemo" SET "organizationId" = 'org_default' WHERE "organizationId" IS NULL;
UPDATE "BrokerMemoEditRequest" SET "organizationId" = 'org_default' WHERE "organizationId" IS NULL;
UPDATE "BrokerMemoItem" SET "organizationId" = 'org_default' WHERE "organizationId" IS NULL;
UPDATE "Customer" SET "organizationId" = 'org_default' WHERE "organizationId" IS NULL;
UPDATE "CustomerNote" SET "organizationId" = 'org_default' WHERE "organizationId" IS NULL;
UPDATE "Expense" SET "organizationId" = 'org_default' WHERE "organizationId" IS NULL;
UPDATE "InventoryItem" SET "organizationId" = 'org_default' WHERE "organizationId" IS NULL;
UPDATE "LeaveRequest" SET "organizationId" = 'org_default' WHERE "organizationId" IS NULL;
UPDATE "LedgerEntry" SET "organizationId" = 'org_default' WHERE "organizationId" IS NULL;
UPDATE "Message" SET "organizationId" = 'org_default' WHERE "organizationId" IS NULL;
UPDATE "Notification" SET "organizationId" = 'org_default' WHERE "organizationId" IS NULL;
UPDATE "PurchaseOrder" SET "organizationId" = 'org_default' WHERE "organizationId" IS NULL;
UPDATE "PurchaseOrderItem" SET "organizationId" = 'org_default' WHERE "organizationId" IS NULL;
UPDATE "PushSubscription" SET "organizationId" = 'org_default' WHERE "organizationId" IS NULL;
UPDATE "RepairOrder" SET "organizationId" = 'org_default' WHERE "organizationId" IS NULL;
UPDATE "Sale" SET "organizationId" = 'org_default' WHERE "organizationId" IS NULL;
UPDATE "SaleItem" SET "organizationId" = 'org_default' WHERE "organizationId" IS NULL;
UPDATE "SalesTarget" SET "organizationId" = 'org_default' WHERE "organizationId" IS NULL;
UPDATE "Staff" SET "organizationId" = 'org_default' WHERE "organizationId" IS NULL;
UPDATE "StaffGroup" SET "organizationId" = 'org_default' WHERE "organizationId" IS NULL;
UPDATE "Supplier" SET "organizationId" = 'org_default' WHERE "organizationId" IS NULL;
UPDATE "Task" SET "organizationId" = 'org_default' WHERE "organizationId" IS NULL;
UPDATE "TaskComment" SET "organizationId" = 'org_default' WHERE "organizationId" IS NULL;

-- AlterTable: now that every row has a value, make the column required
ALTER TABLE "AttendanceLog" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Branch" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Broker" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "BrokerMemo" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "BrokerMemoEditRequest" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "BrokerMemoItem" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Customer" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "CustomerNote" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Expense" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "InventoryItem" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "LeaveRequest" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "LedgerEntry" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Message" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Notification" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "PurchaseOrder" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "PurchaseOrderItem" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "PushSubscription" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "RepairOrder" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Sale" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "SaleItem" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "SalesTarget" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Staff" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "StaffGroup" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Supplier" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Task" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "TaskComment" ALTER COLUMN "organizationId" SET NOT NULL;

-- DropIndex: old globally-unique constraints become per-organization below
DROP INDEX "BrokerMemo_memoNumber_key";
DROP INDEX "InventoryItem_sku_key";
DROP INDEX "PurchaseOrder_orderNumber_key";
DROP INDEX "Sale_invoiceNumber_key";
DROP INDEX "Staff_email_key";

-- CreateIndex
CREATE INDEX "AttendanceLog_organizationId_idx" ON "AttendanceLog"("organizationId");
CREATE INDEX "Branch_organizationId_idx" ON "Branch"("organizationId");
CREATE INDEX "Broker_organizationId_idx" ON "Broker"("organizationId");
CREATE INDEX "BrokerMemo_organizationId_idx" ON "BrokerMemo"("organizationId");
CREATE UNIQUE INDEX "BrokerMemo_organizationId_memoNumber_key" ON "BrokerMemo"("organizationId", "memoNumber");
CREATE INDEX "BrokerMemoEditRequest_organizationId_idx" ON "BrokerMemoEditRequest"("organizationId");
CREATE INDEX "BrokerMemoItem_organizationId_idx" ON "BrokerMemoItem"("organizationId");
CREATE INDEX "Customer_organizationId_idx" ON "Customer"("organizationId");
CREATE INDEX "CustomerNote_organizationId_idx" ON "CustomerNote"("organizationId");
CREATE INDEX "Expense_organizationId_idx" ON "Expense"("organizationId");
CREATE INDEX "InventoryItem_organizationId_idx" ON "InventoryItem"("organizationId");
CREATE UNIQUE INDEX "InventoryItem_organizationId_sku_key" ON "InventoryItem"("organizationId", "sku");
CREATE INDEX "LeaveRequest_organizationId_idx" ON "LeaveRequest"("organizationId");
CREATE INDEX "LedgerEntry_organizationId_idx" ON "LedgerEntry"("organizationId");
CREATE INDEX "Message_organizationId_idx" ON "Message"("organizationId");
CREATE INDEX "Notification_organizationId_idx" ON "Notification"("organizationId");
CREATE INDEX "PurchaseOrder_organizationId_idx" ON "PurchaseOrder"("organizationId");
CREATE UNIQUE INDEX "PurchaseOrder_organizationId_orderNumber_key" ON "PurchaseOrder"("organizationId", "orderNumber");
CREATE INDEX "PurchaseOrderItem_organizationId_idx" ON "PurchaseOrderItem"("organizationId");
CREATE INDEX "PushSubscription_organizationId_idx" ON "PushSubscription"("organizationId");
CREATE INDEX "RepairOrder_organizationId_idx" ON "RepairOrder"("organizationId");
CREATE INDEX "Sale_organizationId_idx" ON "Sale"("organizationId");
CREATE UNIQUE INDEX "Sale_organizationId_invoiceNumber_key" ON "Sale"("organizationId", "invoiceNumber");
CREATE INDEX "SaleItem_organizationId_idx" ON "SaleItem"("organizationId");
CREATE INDEX "SalesTarget_organizationId_idx" ON "SalesTarget"("organizationId");
CREATE INDEX "Staff_organizationId_idx" ON "Staff"("organizationId");
CREATE UNIQUE INDEX "Staff_organizationId_email_key" ON "Staff"("organizationId", "email");
CREATE INDEX "StaffGroup_organizationId_idx" ON "StaffGroup"("organizationId");
CREATE INDEX "Supplier_organizationId_idx" ON "Supplier"("organizationId");
CREATE INDEX "Task_organizationId_idx" ON "Task"("organizationId");
CREATE INDEX "TaskComment_organizationId_idx" ON "TaskComment"("organizationId");

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerNote" ADD CONSTRAINT "CustomerNote_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceLog" ADD CONSTRAINT "AttendanceLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RepairOrder" ADD CONSTRAINT "RepairOrder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffGroup" ADD CONSTRAINT "StaffGroup_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesTarget" ADD CONSTRAINT "SalesTarget_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Broker" ADD CONSTRAINT "Broker_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BrokerMemo" ADD CONSTRAINT "BrokerMemo_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BrokerMemoItem" ADD CONSTRAINT "BrokerMemoItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BrokerMemoEditRequest" ADD CONSTRAINT "BrokerMemoEditRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
