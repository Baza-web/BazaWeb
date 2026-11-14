-- AlterTable
ALTER TABLE "AttendanceLog" ADD COLUMN     "clockInLat" DOUBLE PRECISION,
ADD COLUMN     "clockInLng" DOUBLE PRECISION,
ADD COLUMN     "clockOutLat" DOUBLE PRECISION,
ADD COLUMN     "clockOutLng" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "geofenceRadiusM" INTEGER,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION;
