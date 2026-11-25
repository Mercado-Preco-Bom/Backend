import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SIGNAL_LOST_THRESHOLD_MS = 2 * 60 * 1000;
const DISCONNECTED_THRESHOLD_MS = 8 * 60 * 60 * 1000;

export class AdminController {
  async getDashboard(req: Request, res: Response) {
    try {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const deliveries = await prisma.delivery.findMany({
        where: {
          OR: [
            { createdAt: { gte: startOfDay } },
            { status: { notIn: ['DELIVERED', 'CANCELED'] } },
          ],
        },
        include: {
          customer: true,
          driver: { select: { id: true, name: true, email: true, role: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      const drivers = await prisma.user.findMany({
        where: { role: 'DRIVER' },
        select: {
          id: true,
          name: true,
          lastLatitude: true,
          lastLongitude: true,
          lastLocationAt: true,
        },
      });

      // Saídas do motorista (do raio do mercado até a volta). Inclui as de hoje, as em aberto
      // e as que ainda têm entregas na lista.
      const tripIds = [...new Set(deliveries.map((d) => d.tripId).filter((t): t is string => !!t))];
      const trips = await prisma.driverTrip.findMany({
        where: {
          OR: [{ leftAt: { gte: startOfDay } }, { returnedAt: null }, { id: { in: tripIds } }],
        },
        orderBy: { leftAt: 'asc' },
        select: { id: true, driverId: true, leftAt: true, returnedAt: true, estimated: true },
      });

      const driversBase = await prisma.user.findMany({
        where: { role: 'DRIVER' },
        select: { id: true, atBase: true },
      });
      const atBaseById = new Map(driversBase.map((d) => [d.id, d.atBase]));

      const active = deliveries.filter((d) => d.status !== 'CANCELED');
      const canceled = deliveries.length - active.length;
      const totalToday = active.length;
      const completed = active.filter((d) => d.status === 'DELIVERED').length;
      const pending = totalToday - completed;

      const avgMinutes = (values: number[]) =>
        values.length === 0
          ? 0
          : Math.round(values.reduce((sum, v) => sum + v, 0) / values.length / 60000);

      const idleDurations = active
        .filter((d) => d.assignedAt && d.startedAt)
        .map(
          (d) =>
            (d.startedAt ? d.startedAt.getTime() : 0) - (d.assignedAt ? d.assignedAt.getTime() : 0),
        )
        .filter((ms) => ms >= 0);

      const routeDurations = active
        .filter((d) => d.startedAt && d.finishedAt)
        .map(
          (d) =>
            (d.finishedAt ? d.finishedAt.getTime() : 0) - (d.startedAt ? d.startedAt.getTime() : 0),
        )
        .filter((ms) => ms >= 0);

      const now = Date.now();

      return res.json({
        metrics: {
          totalToday,
          completed,
          pending,
          canceled,
          avgIdleTime: avgMinutes(idleDurations),
          avgRouteTime: avgMinutes(routeDurations),
        },
        drivers: drivers.map((driver) => {
          const inTransit = deliveries.find(
            (d) => d.driverId === driver.id && d.status === 'IN_TRANSIT' && d.startedAt !== null,
          );
          const queuedCount = deliveries.filter(
            (d) => d.driverId === driver.id && d.status === 'IN_TRANSIT' && d.startedAt === null,
          ).length;
          const openTrip =
            trips.find((t) => t.driverId === driver.id && t.returnedAt === null) ?? null;

          // EM_ROTA: entrega iniciada | VOLTANDO: fora do mercado sem entrega em andamento
          // NO_MERCADO: dentro do raio | INDEFINIDO: ainda sem posição para saber
          let status: 'EM_ROTA' | 'VOLTANDO' | 'NO_MERCADO' | 'INDEFINIDO' = 'INDEFINIDO';
          if (inTransit) status = 'EM_ROTA';
          else if (openTrip) status = 'VOLTANDO';
          else if (atBaseById.get(driver.id) === true) status = 'NO_MERCADO';

          let connectionStatus: 'ONLINE' | 'SINAL_PERDIDO' | 'DESCONECTADO' = 'DESCONECTADO';
          if (driver.lastLocationAt && driver.lastLocationAt.getTime() > 1000) {
            const ageMs = now - driver.lastLocationAt.getTime();
            if (ageMs <= SIGNAL_LOST_THRESHOLD_MS) {
              connectionStatus = 'ONLINE';
            } else if (ageMs <= DISCONNECTED_THRESHOLD_MS) {
              connectionStatus = 'SINAL_PERDIDO';
            }
          }

          return {
            id: driver.id,
            name: driver.name,
            status,
            queuedCount,
            openTripLeftAt: openTrip?.leftAt ?? null,
            connectionStatus,
            currentDelivery: inTransit || null,
            lastLocation:
              driver.lastLatitude !== null && driver.lastLongitude !== null
                ? {
                    latitude: driver.lastLatitude,
                    longitude: driver.lastLongitude,
                    at:
                      driver.lastLocationAt && driver.lastLocationAt.getTime() > 1000
                        ? driver.lastLocationAt
                        : null,
                  }
                : null,
          };
        }),
        history: deliveries,
        trips,
      });
    } catch (error) {
      console.error('Erro no AdminController:', error);
      return res.status(500).json({ error: 'Erro ao carregar dados do dashboard.' });
    }
  }

  async getHistory(req: Request, res: Response) {
    try {
      const { startDate, endDate, status } = req.query;

      const start = startDate
        ? new Date(startDate as string)
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const end = endDate ? new Date(endDate as string) : new Date();

      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);

      let statusWhere: { status?: string } = { status: 'DELIVERED' };
      if (status === 'ALL') {
        statusWhere = {};
      } else if (
        typeof status === 'string' &&
        ['PENDING', 'IN_TRANSIT', 'DELIVERED', 'CANCELED'].includes(status)
      ) {
        statusWhere = { status };
      }

      const history = await prisma.delivery.findMany({
        where: {
          createdAt: {
            gte: start,
            lte: end,
          },
          ...statusWhere,
        },
        include: {
          customer: true,
          driver: { select: { id: true, name: true, email: true, role: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      return res.json(history);
    } catch (error) {
      console.error('Erro ao buscar histórico:', error);
      return res.status(500).json({ error: 'Erro ao carregar histórico.' });
    }
  }
}
