import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class AdminController {
  async getDashboard(req: Request, res: Response) {
    try {
      // Define o inicio do dia
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      // Procura as entregas de hoje e inclui os dados do cliente e do motorista
      const deliveries = await prisma.delivery.findMany({
        where: { createdAt: { gte: startOfDay } },
        include: {
          customer: true,
          // select evita vazar a senha do motorista na resposta
          driver: { select: { id: true, name: true, email: true, role: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      // Procura todos os motoristas
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

      // Calcula as métricas (Entregas completas, total de entregas, quantas faltam ser entregues)
      const totalToday = deliveries.length;
      const completed = deliveries.filter((d) => d.status === 'DELIVERED').length;
      const pending = totalToday - completed;

      // Tempos médios REAIS (em minutos), calculados a partir das horas gravadas:
      // - avgIdleTime: da atribuição ao motorista até ele iniciar a rota
      // - avgRouteTime: do início até a finalização da entrega
      const avgMinutes = (values: number[]) =>
        values.length === 0
          ? 0
          : Math.round(values.reduce((sum, v) => sum + v, 0) / values.length / 60000);

      const idleDurations = deliveries
        .filter((d) => d.assignedAt && d.startedAt)
        .map((d) => d.startedAt!.getTime() - d.assignedAt!.getTime())
        .filter((ms) => ms >= 0);

      const routeDurations = deliveries
        .filter((d) => d.startedAt && d.finishedAt)
        .map((d) => d.finishedAt!.getTime() - d.startedAt!.getTime())
        .filter((ms) => ms >= 0);

      // Devolve a resposta estruturada
      return res.json({
        metrics: {
          totalToday,
          completed,
          pending,
          avgIdleTime: avgMinutes(idleDurations),
          avgRouteTime: avgMinutes(routeDurations),
        },
        drivers: drivers.map((driver) => {
          // Verifica se o motorista tem alguma entrega em trânsito agora
          const inTransit = deliveries.find(
            (d) => d.driverId === driver.id && d.status === 'IN_TRANSIT',
          );
          return {
            id: driver.id,
            name: driver.name,
            status: inTransit ? 'EM_ROTA' : 'DISPONIVEL',
            currentDelivery: inTransit || null,
            lastLocation:
              driver.lastLatitude !== null && driver.lastLongitude !== null
                ? {
                    latitude: driver.lastLatitude,
                    longitude: driver.lastLongitude,
                    at: driver.lastLocationAt,
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
