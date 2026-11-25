-- Cerca virtual calculada no servidor
ALTER TABLE "User" ADD COLUMN "atBase" BOOLEAN;
ALTER TABLE "User" ADD COLUMN "atBaseSince" TIMESTAMP(3);

-- Saídas do motorista (tempo fora do mercado)
CREATE TABLE "DriverTrip" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "leftAt" TIMESTAMP(3) NOT NULL,
    "returnedAt" TIMESTAMP(3),
    "estimated" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "DriverTrip_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DriverTrip_driverId_leftAt_idx" ON "DriverTrip"("driverId", "leftAt");
ALTER TABLE "DriverTrip" ADD CONSTRAINT "DriverTrip_driverId_fkey"
    FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Entrega: cancelamento e vínculo com a saída
ALTER TABLE "Delivery" ADD COLUMN "canceledAt" TIMESTAMP(3);
ALTER TABLE "Delivery" ADD COLUMN "cancelReason" TEXT;
ALTER TABLE "Delivery" ADD COLUMN "tripId" TEXT;
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_tripId_fkey"
    FOREIGN KEY ("tripId") REFERENCES "DriverTrip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Cliente: sítio, endereço opcional e localização marcada pelo motorista
ALTER TABLE "Customer" ALTER COLUMN "street" DROP NOT NULL;
ALTER TABLE "Customer" ALTER COLUMN "number" DROP NOT NULL;
ALTER TABLE "Customer" ADD COLUMN "isRural" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Customer" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "Customer" ADD COLUMN "longitude" DOUBLE PRECISION;
ALTER TABLE "Customer" ADD COLUMN "locationUpdatedAt" TIMESTAMP(3);
