-- CreateTable
CREATE TABLE "NavSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "order" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NavSettings_pkey" PRIMARY KEY ("id")
);

