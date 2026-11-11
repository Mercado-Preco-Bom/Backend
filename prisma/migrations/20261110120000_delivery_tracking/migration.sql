-- Rastreamento da entrega: atribuição, início e fim (hora + localização) e trajeto.
-- Troca as colunas PostGIS (startCoordinates / endCoordinates) por latitude/longitude
-- comuns, copiando os dados que já existirem.

-- AlterTable: User
ALTER TABLE "User"
  ADD COLUMN "lastLatitude" DOUBLE PRECISION,
  ADD COLUMN "lastLongitude" DOUBLE PRECISION,
  ADD COLUMN "lastLocationAt" TIMESTAMP(3);

-- AlterTable: Delivery (novas colunas)
ALTER TABLE "Delivery"
  ADD COLUMN "assignedAt" TIMESTAMP(3),
  ADD COLUMN "assignedLatitude" DOUBLE PRECISION,
  ADD COLUMN "assignedLongitude" DOUBLE PRECISION,
  ADD COLUMN "startLatitude" DOUBLE PRECISION,
  ADD COLUMN "startLongitude" DOUBLE PRECISION,
  ADD COLUMN "endLatitude" DOUBLE PRECISION,
  ADD COLUMN "endLongitude" DOUBLE PRECISION;

-- Preserva o que já estava gravado nas colunas geometry
UPDATE "Delivery"
SET "startLongitude" = ST_X("startCoordinates"),
    "startLatitude"  = ST_Y("startCoordinates")
WHERE "startCoordinates" IS NOT NULL;

UPDATE "Delivery"
SET "endLongitude" = ST_X("endCoordinates"),
    "endLatitude"  = ST_Y("endCoordinates")
WHERE "endCoordinates" IS NOT NULL;

-- Entregas antigas que já tinham motorista: usa a data de criação como "atribuída em"
UPDATE "Delivery"
SET "assignedAt" = "createdAt"
WHERE "driverId" IS NOT NULL AND "assignedAt" IS NULL;

-- Remove as colunas antigas
ALTER TABLE "Delivery"
  DROP COLUMN "startCoordinates",
  DROP COLUMN "endCoordinates";

-- CreateTable
CREATE TABLE "DeliveryTrackPoint" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "speed" DOUBLE PRECISION,
    "heading" DOUBLE PRECISION,
    "accuracy" DOUBLE PRECISION,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryTrackPoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeliveryTrackPoint_deliveryId_recordedAt_idx" ON "DeliveryTrackPoint"("deliveryId", "recordedAt");

-- AddForeignKey
ALTER TABLE "DeliveryTrackPoint" ADD CONSTRAINT "DeliveryTrackPoint_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;
