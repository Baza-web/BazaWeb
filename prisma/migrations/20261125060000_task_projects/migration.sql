-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "projectId" TEXT;

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brandId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Project_brandId_key" ON "Project"("brandId");

-- CreateIndex
CREATE INDEX "Project_brandId_idx" ON "Project"("brandId");

-- CreateIndex
CREATE INDEX "Task_projectId_idx" ON "Task"("projectId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DataMigration: back-fill a Project for every existing Brand, so brand-based
-- task grouping works immediately for brands that already existed before this
-- feature shipped, not just ones created afterward.
INSERT INTO "Project" ("id", "name", "brandId", "createdById", "createdAt")
SELECT gen_random_uuid()::text, b."name", b."id", (SELECT s."id" FROM "Staff" s WHERE s."role" = 'OWNER' ORDER BY s."createdAt" ASC LIMIT 1), now()
FROM "Brand" b
WHERE NOT EXISTS (SELECT 1 FROM "Project" p WHERE p."brandId" = b."id")
AND EXISTS (SELECT 1 FROM "Staff" s WHERE s."role" = 'OWNER');
