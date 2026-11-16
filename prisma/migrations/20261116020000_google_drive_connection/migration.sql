-- CreateTable
CREATE TABLE "GoogleDriveConnection" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "encryptedRefreshToken" TEXT NOT NULL,
    "googleEmail" TEXT NOT NULL,
    "driveFolderId" TEXT,
    "connectedByStaffId" TEXT NOT NULL,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleDriveConnection_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "GoogleDriveConnection" ADD CONSTRAINT "GoogleDriveConnection_connectedByStaffId_fkey" FOREIGN KEY ("connectedByStaffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

