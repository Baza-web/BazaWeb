-- CreateEnum
CREATE TYPE "InventoryAttributeKind" AS ENUM ('GEMSTONE_TYPE', 'CLARITY', 'CUT', 'CERTIFICATION');

-- CreateTable
CREATE TABLE "InventoryAttributeOption" (
    "id" TEXT NOT NULL,
    "kind" "InventoryAttributeKind" NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryAttributeOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InventoryAttributeOption_kind_idx" ON "InventoryAttributeOption"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryAttributeOption_kind_name_key" ON "InventoryAttributeOption"("kind", "name");

-- Seed a starter canonical vocabulary so the picklists aren't empty on day one.
-- Staff can still add more via the "+ Add new..." option in the UI.
INSERT INTO "InventoryAttributeOption" ("id", "kind", "name") VALUES
  (gen_random_uuid()::text, 'GEMSTONE_TYPE', 'Diamond'),
  (gen_random_uuid()::text, 'GEMSTONE_TYPE', 'Ruby'),
  (gen_random_uuid()::text, 'GEMSTONE_TYPE', 'Sapphire'),
  (gen_random_uuid()::text, 'GEMSTONE_TYPE', 'Emerald'),
  (gen_random_uuid()::text, 'GEMSTONE_TYPE', 'Spinel'),
  (gen_random_uuid()::text, 'GEMSTONE_TYPE', 'Tourmaline'),
  (gen_random_uuid()::text, 'GEMSTONE_TYPE', 'Topaz'),
  (gen_random_uuid()::text, 'GEMSTONE_TYPE', 'Aquamarine'),
  (gen_random_uuid()::text, 'GEMSTONE_TYPE', 'Garnet'),
  (gen_random_uuid()::text, 'GEMSTONE_TYPE', 'Amethyst'),
  (gen_random_uuid()::text, 'GEMSTONE_TYPE', 'Citrine'),
  (gen_random_uuid()::text, 'GEMSTONE_TYPE', 'Peridot'),
  (gen_random_uuid()::text, 'GEMSTONE_TYPE', 'Opal'),
  (gen_random_uuid()::text, 'GEMSTONE_TYPE', 'Pearl'),
  (gen_random_uuid()::text, 'GEMSTONE_TYPE', 'Zircon'),
  (gen_random_uuid()::text, 'GEMSTONE_TYPE', 'Tanzanite'),
  (gen_random_uuid()::text, 'GEMSTONE_TYPE', 'Moissanite'),
  (gen_random_uuid()::text, 'GEMSTONE_TYPE', 'Morganite'),
  (gen_random_uuid()::text, 'GEMSTONE_TYPE', 'Alexandrite'),
  (gen_random_uuid()::text, 'GEMSTONE_TYPE', 'Tsavorite'),
  (gen_random_uuid()::text, 'CLARITY', 'FL'),
  (gen_random_uuid()::text, 'CLARITY', 'IF'),
  (gen_random_uuid()::text, 'CLARITY', 'VVS1'),
  (gen_random_uuid()::text, 'CLARITY', 'VVS2'),
  (gen_random_uuid()::text, 'CLARITY', 'VS1'),
  (gen_random_uuid()::text, 'CLARITY', 'VS2'),
  (gen_random_uuid()::text, 'CLARITY', 'SI1'),
  (gen_random_uuid()::text, 'CLARITY', 'SI2'),
  (gen_random_uuid()::text, 'CLARITY', 'I1'),
  (gen_random_uuid()::text, 'CLARITY', 'I2'),
  (gen_random_uuid()::text, 'CLARITY', 'I3'),
  (gen_random_uuid()::text, 'CUT', 'Round'),
  (gen_random_uuid()::text, 'CUT', 'Princess'),
  (gen_random_uuid()::text, 'CUT', 'Cushion'),
  (gen_random_uuid()::text, 'CUT', 'Emerald'),
  (gen_random_uuid()::text, 'CUT', 'Oval'),
  (gen_random_uuid()::text, 'CUT', 'Pear'),
  (gen_random_uuid()::text, 'CUT', 'Marquise'),
  (gen_random_uuid()::text, 'CUT', 'Radiant'),
  (gen_random_uuid()::text, 'CUT', 'Asscher'),
  (gen_random_uuid()::text, 'CUT', 'Heart'),
  (gen_random_uuid()::text, 'CUT', 'Baguette'),
  (gen_random_uuid()::text, 'CERTIFICATION', 'GIA'),
  (gen_random_uuid()::text, 'CERTIFICATION', 'IGI'),
  (gen_random_uuid()::text, 'CERTIFICATION', 'AGS'),
  (gen_random_uuid()::text, 'CERTIFICATION', 'GRS'),
  (gen_random_uuid()::text, 'CERTIFICATION', 'Gubelin'),
  (gen_random_uuid()::text, 'CERTIFICATION', 'SSEF'),
  (gen_random_uuid()::text, 'CERTIFICATION', 'AIGS'),
  (gen_random_uuid()::text, 'CERTIFICATION', 'None');
