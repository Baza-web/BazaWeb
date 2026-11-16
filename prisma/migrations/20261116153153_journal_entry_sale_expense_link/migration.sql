-- AlterTable
ALTER TABLE "JournalEntry" ADD COLUMN     "expenseId" TEXT,
ADD COLUMN     "saleId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_saleId_key" ON "JournalEntry"("saleId");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_expenseId_key" ON "JournalEntry"("expenseId");

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

