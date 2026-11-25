-- AlterTable
ALTER TABLE "Staff" ADD COLUMN     "additionalRoles" "Role"[] DEFAULT ARRAY[]::"Role"[];
