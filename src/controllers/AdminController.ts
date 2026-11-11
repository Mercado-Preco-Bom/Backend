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
          OR: [{ createdAt: { gte: startOfDay } }, { status: { not: 'DELIVERED' } }],
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

      const totalToday = deliveries.length;
      const completed = deliveries.filter((d) => d.status === 'DELIVERED').length;
      const pending = totalToday - completed;

      const avgMinutes = (values: number[]) =>
        values.length === 0
          ? 0
          : Math.round(values.reduce((sum, v) => sum + v, 0) / values.length / 60000);

      const idleDurations = deliveries
        .filter((d) => d.assignedAt && d.startedAt)
        .map(
          (d) =>
            (d.startedAt ? d.startedAt.getTime() : 0) - (d.assignedAt ? d.assignedAt.getTime() : 0),
        )
        .filter((ms) => ms >= 0);

      const routeDurations = deliveries
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
          avgIdleTime: avgMinutes(idleDurations),
          avgRouteTime: avgMinutes(routeDurations),
        },
        drivers: drivers.map((driver) => {
          const inTransit = deliveries.find(
            (d) => d.driverId === driver.id && d.status === 'IN_TRANSIT' && d.startedAt !== null,
          );

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
            status: inTransit ? 'EM_ROTA' : 'DISPONIVEL',
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
      });
    } catch (error) {
      console.error('Erro no AdminController:', error);
      return res.status(500).json({ error: 'Erro ao carregar dados do dashboard.' });
    }
  }
}
