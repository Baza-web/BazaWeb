/*
  Warnings:

  - Added the required column `brandId` to the `SocialPost` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "brandId" TEXT;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "brandId" TEXT;

-- AlterTable
ALTER TABLE "SocialPost" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "autoPublish" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "brandId" TEXT NOT NULL,
ADD COLUMN     "instagramMediaId" TEXT,
ADD COLUMN     "publishError" TEXT,
ADD COLUMN     "publishedToInstagramAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Brand" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_StaffBrands" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Brand_name_key" ON "Brand"("name");

-- CreateIndex
CREATE UNIQUE INDEX "_StaffBrands_AB_unique" ON "_StaffBrands"("A", "B");

-- CreateIndex
CREATE INDEX "_StaffBrands_B_index" ON "_StaffBrands"("B");

-- CreateIndex
CREATE INDEX "Expense_brandId_idx" ON "Expense"("brandId");

-- CreateIndex
CREATE INDEX "Sale_brandId_idx" ON "Sale"("brandId");

-- CreateIndex
CREATE INDEX "SocialPost_brandId_idx" ON "SocialPost"("brandId");

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_StaffBrands" ADD CONSTRAINT "_StaffBrands_A_fkey" FOREIGN KEY ("A") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_StaffBrands" ADD CONSTRAINT "_StaffBrands_B_fkey" FOREIGN KEY ("B") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed the house brands this business trades under. Idempotent (ON CONFLICT
-- DO NOTHING on the unique name) so it's safe even if run more than once.
INSERT INTO "Brand" ("id", "name") VALUES
  (gen_random_uuid()::text, 'Baza Boutique'),
  (gen_random_uuid()::text, 'Silver Boutique'),
  (gen_random_uuid()::text, 'Gem Boutique'),
  (gen_random_uuid()::text, 'Maison Dor'),
  (gen_random_uuid()::text, 'NBK Bangkok'),
  (gen_random_uuid()::text, 'Madman Theory'),
  (gen_random_uuid()::text, 'PHV')
ON CONFLICT ("name") DO NOTHING;
