import { Prisma, PrismaClient } from '@prisma/client';
import { Coords } from './location';

const prisma = new PrismaClient();

// Localização do mercado (pode ser trocada por variável de ambiente, sem mexer no código)
export const BASE_COORDS: Coords = {
  // -24.49654209765161, -47.84237988293177
  latitude: Number(process.env.BASE_LATITUDE ?? -24.49654209765161),
  longitude: Number(process.env.BASE_LONGITUDE ?? -47.84237988293177),
};

// Entra no mercado a 50 m; só conta como "saiu" depois de 70 m (histerese contra oscilação do GPS)
const ENTER_RADIUS_M = Number(process.env.BASE_RADIUS_METERS ?? 50);
const EXIT_RADIUS_M = ENTER_RADIUS_M + 20;
// Leituras de GPS muito imprecisas não mudam o estado
const MAX_ACCURACY_M = 100;
// Saída fechada em menos que isso e sem nenhuma entrega vinculada é ruído de GPS
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

  if (seconds < NOISE_TRIP_SECONDS) {
    const linked = await tx.delivery.count({ where: { tripId: trip.id } });
    if (linked === 0) {
      await tx.driverTrip.delete({ where: { id: trip.id } });
      return;
    }
  }
  await tx.driverTrip.update({ where: { id: trip.id }, data: { returnedAt } });
}

/**
 * Chamado a cada posição recebida do motorista. Detecta, no servidor, quando ele
 * sai do raio do mercado (abre uma saída) e quando volta (fecha a saída).
 */
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
  if (!inside && !outside) return; // zona de histerese: mantém o estado

  await prisma.$transaction(async (tx) => {
    // evita duas requisições simultâneas do mesmo motorista abrirem duas saídas
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${driverId}))`;

    const driver = await tx.user.findUnique({
      where: { id: driverId },
      select: { atBase: true, atBaseSince: true },
    });
    if (!driver) return;

    // leitura antiga que chegou atrasada (fila offline): não desfaz o que já sabemos
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

    // fora do raio
    if (openTrip) {
      if (driver.atBase !== false) {
        await tx.user.update({ where: { id: driverId }, data: { atBase: false, atBaseSince: at } });
      }
      return;
    }

    let leftAt: Date | null = null;
    let estimated = false;

    if (driver.atBase === true) {
      leftAt = at; // saiu de verdade: o último estado conhecido era "no mercado"
    } else {
      // Estado desconhecido (ex.: primeiro uso). Se já há entrega iniciada, deduz a saída por ela.
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
      // entregas já atribuídas/iniciadas e ainda sem saída passam a pertencer a esta viagem
      await tx.delivery.updateMany({
        where: { driverId, tripId: null, status: 'IN_TRANSIT' },
        data: { tripId: trip.id },
      });
    }

    await tx.user.update({ where: { id: driverId }, data: { atBase: false, atBaseSince: at } });
  });
}

/** Saída em aberto do motorista (ele está fora do mercado agora), se houver. */
export async function getOpenTrip(driverId: string) {
  return prisma.driverTrip.findFirst({
    where: { driverId, returnedAt: null },
    orderBy: { leftAt: 'desc' },
  });
}

/**
 * Entrega nova (ou trocada) para um motorista que JÁ está na rua recebe a saída dele.
 * Se ele ainda está no mercado, fica sem saída até ele sair (aí é vinculada em processDriverPosition).
 */
export async function currentTripIdFor(
  driverId: string | null | undefined,
): Promise<string | null> {
  if (!driverId) return null;
  const trip = await getOpenTrip(driverId);
  return trip?.id ?? null;
}
