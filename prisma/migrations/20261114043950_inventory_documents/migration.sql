-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN     "documents" TEXT[] DEFAULT ARRAY[]::TEXT[];
