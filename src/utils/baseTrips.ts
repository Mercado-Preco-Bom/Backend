import { Prisma, PrismaClient } from '@prisma/client';
import { Coords } from './location';

const prisma = new PrismaClient();

export const BASE_COORDS: Coords = {
  latitude: Number(process.env.BASE_LATITUDE ?? -24.49654209765161),
  longitude: Number(process.env.BASE_LONGITUDE ?? -47.84237988293177),
};

const ENTER_RADIUS_M = Number(process.env.BASE_RADIUS_METERS ?? 50);
const EXIT_RADIUS_M = ENTER_RADIUS_M + 20;
const MAX_ACCURACY_M = 100;
const NOISE_TRIP_SECONDS = 90;

const EARTH_RADIUS_M = 6371000;
const toRad = (v: number) => (v * Math.PI) / 180;

export function distanceMeters(a: Coords, b: Coords): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

type Tx = Prisma.TransactionClient;

async function closeTrip(tx: Tx, trip: { id: string; leftAt: Date }, at: Date) {
  const returnedAt = at.getTime() < trip.leftAt.getTime() ? trip.leftAt : at;
  const seconds = (returnedAt.getTime() - trip.leftAt.getTime()) / 1000;

  const [linked, inTransit] = await Promise.all([
    tx.delivery.count({ where: { tripId: trip.id } }),
    tx.delivery.count({ where: { tripId: trip.id, status: 'IN_TRANSIT' } }),
  ]);

  if (inTransit > 0) return;

  if (seconds < NOISE_TRIP_SECONDS) {
    if (linked === 0) {
      await tx.driverTrip.delete({ where: { id: trip.id } });
    }
    return;
  }

  await tx.driverTrip.update({ where: { id: trip.id }, data: { returnedAt } });
}

export async function processDriverPosition(
  driverId: string,
  coords: Coords,
  at: Date,
  accuracy?: number | null,
) {
  if (accuracy != null && accuracy > MAX_ACCURACY_M) return;

  const distance = distanceMeters(coords, BASE_COORDS);
  const inside = distance <= ENTER_RADIUS_M;
  const outside = distance > EXIT_RADIUS_M;
  if (!inside && !outside) return;

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${driverId}))`;

    const driver = await tx.user.findUnique({
      where: { id: driverId },
      select: { atBase: true, atBaseSince: true },
    });
    if (!driver) return;

    if (driver.atBaseSince && at.getTime() < driver.atBaseSince.getTime()) return;

    const openTrip = await tx.driverTrip.findFirst({
      where: { driverId, returnedAt: null },
      orderBy: { leftAt: 'desc' },
    });

    if (inside) {
      if (openTrip) await closeTrip(tx, openTrip, at);
      if (driver.atBase !== true) {
        await tx.user.update({ where: { id: driverId }, data: { atBase: true, atBaseSince: at } });
      }
      return;
    }

    if (openTrip) {
      if (driver.atBase !== false) {
        await tx.user.update({ where: { id: driverId }, data: { atBase: false, atBaseSince: at } });
      }
      return;
    }

    let leftAt: Date | null = null;
    let estimated = false;

    if (driver.atBase === true) {
      leftAt = at;
    } else {
      const started = await tx.delivery.findFirst({
        where: { driverId, status: 'IN_TRANSIT', startedAt: { not: null } },
        orderBy: { startedAt: 'asc' },
        select: { startedAt: true },
      });
      if (started?.startedAt) {
        leftAt = started.startedAt;
        estimated = true;
      }
    }

    if (leftAt) {
      const trip = await tx.driverTrip.create({ data: { driverId, leftAt, estimated } });
      await tx.delivery.updateMany({
        where: { driverId, tripId: null, status: 'IN_TRANSIT' },
        data: { tripId: trip.id },
      });
    }

    await tx.user.update({ where: { id: driverId }, data: { atBase: false, atBaseSince: at } });
  });
}

export async function getOpenTrip(driverId: string) {
  return prisma.driverTrip.findFirst({
    where: { driverId, returnedAt: null },
    orderBy: { leftAt: 'desc' },
  });
}

export async function currentTripIdFor(
  driverId: string | null | undefined,
): Promise<string | null> {
  if (!driverId) return null;
  const trip = await getOpenTrip(driverId);
  return trip?.id ?? null;
}
