/*
  Warnings:

  - You are about to drop the column `assignedCoordinates` on the `Delivery` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Delivery" DROP COLUMN "assignedCoordinates",
ADD COLUMN     "description" TEXT;

-- CreateTable
CREATE TABLE "DriverBaseReturn" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "arrivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriverBaseReturn_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "DriverBaseReturn" ADD CONSTRAINT "DriverBaseReturn_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
