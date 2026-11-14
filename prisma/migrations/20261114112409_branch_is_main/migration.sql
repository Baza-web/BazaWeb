-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "isMain" BOOLEAN NOT NULL DEFAULT false;

-- Mark the oldest existing branch (your original location) as the main one,
-- so upgrading doesn't leave every branch unmarked.
UPDATE "Branch" SET "isMain" = true WHERE id = (SELECT id FROM "Branch" ORDER BY "createdAt" ASC LIMIT 1);
