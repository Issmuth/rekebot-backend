-- CreateEnum
CREATE TYPE "Station" AS ENUM ('BAR', 'KITCHEN');

-- AlterTable
ALTER TABLE "MenuItem" ADD COLUMN     "station" "Station" NOT NULL DEFAULT 'BAR';
