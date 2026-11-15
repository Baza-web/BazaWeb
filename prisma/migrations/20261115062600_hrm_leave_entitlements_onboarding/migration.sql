-- CreateTable
CREATE TABLE "LeaveEntitlement" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "type" "LeaveType" NOT NULL,
    "year" INTEGER NOT NULL,
    "daysAllotted" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveEntitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingTask" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OnboardingTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LeaveEntitlement_staffId_type_year_key" ON "LeaveEntitlement"("staffId", "type", "year");

-- CreateIndex
CREATE INDEX "OnboardingTask_staffId_idx" ON "OnboardingTask"("staffId");

-- AddForeignKey
ALTER TABLE "LeaveEntitlement" ADD CONSTRAINT "LeaveEntitlement_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingTask" ADD CONSTRAINT "OnboardingTask_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
