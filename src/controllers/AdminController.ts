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
          driver: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      // Procura todos os motoristas
      const drivers = await prisma.user.findMany({
        where: { role: 'DRIVER' },
        select: { id: true, name: true },
      });

      // Calcula as métricas (Entregas completas, total de entregas, quantas faltam ser entregues)
      const totalToday = deliveries.length;
      const completed = deliveries.filter((d) => d.status === 'DELIVERED').length;
      const pending = totalToday - completed;

      // Devolve a resposta estruturada
      return res.json({
        metrics: {
          totalToday,
          completed,
          pending,
          avgIdleTime: 15,
          avgRouteTime: 21,
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
