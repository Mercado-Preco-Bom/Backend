import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SIGNAL_LOST_THRESHOLD_MS = 2 * 60 * 1000;
const DISCONNECTED_THRESHOLD_MS = 8 * 60 * 60 * 1000;

export class AdminController {
  async getDashboard(req: Request, res: Response) {
    try {
      // Define a data de hoje com horário
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      // Busca no banco todas as entregas criadas hoje OU que ainda não foram finalizadas
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

      // Busca todos os usuários cadastrados como motoristas (DRIVER)
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

      // Calcula as métricas básicas de quantidade de entregas do dia
      const totalToday = deliveries.length;
      const completed = deliveries.filter((d) => d.status === 'DELIVERED').length;
      const pending = totalToday - completed;

      // Função auxiliar para converter milissegundos em minutos arredondados
      const avgMinutes = (values: number[]) =>
        values.length === 0
          ? 0
          : Math.round(values.reduce((sum, v) => sum + v, 0) / values.length / 60000);

      // Calcula o tempo de ociosidade (diferença entre a atribuição e o início efetivo pelo motorista)
      const idleDurations = deliveries
        .filter((d) => d.assignedAt && d.startedAt)
        .map(
          (d) =>
            (d.startedAt ? d.startedAt.getTime() : 0) - (d.assignedAt ? d.assignedAt.getTime() : 0),
        )
        .filter((ms) => ms >= 0);

      // Calcula a duração total do percurso (diferença entre o início e a finalização da entrega)
      const routeDurations = deliveries
        .filter((d) => d.startedAt && d.finishedAt)
        .map(
          (d) =>
            (d.finishedAt ? d.finishedAt.getTime() : 0) - (d.startedAt ? d.startedAt.getTime() : 0),
        )
        .filter((ms) => ms >= 0);

      // Armazena o timestamp atual para validar a conexão dos motoristas
      const now = Date.now();

      // Monta a resposta JSON consolidada com métricas, status dos motoristas e histórico
      return res.json({
        metrics: {
          totalToday,
          completed,
          pending,
          avgIdleTime: avgMinutes(idleDurations),
          avgRouteTime: avgMinutes(routeDurations),
        },
        drivers: drivers.map((driver) => {
          // Identifica se o motorista está com alguma entrega ativa e em andamento
          const inTransit = deliveries.find(
            (d) => d.driverId === driver.id && d.status === 'IN_TRANSIT' && d.startedAt !== null,
          );

          // Valida o estado de conexão do motorista com base no tempo do último ping de GPS
          let connectionStatus: 'ONLINE' | 'SINAL_PERDIDO' | 'DESCONECTADO' = 'DESCONECTADO';
          if (driver.lastLocationAt && driver.lastLocationAt.getTime() > 1000) {
            const ageMs = now - driver.lastLocationAt.getTime();
            if (ageMs <= SIGNAL_LOST_THRESHOLD_MS) {
              connectionStatus = 'ONLINE';
            } else if (ageMs <= DISCONNECTED_THRESHOLD_MS) {
              connectionStatus = 'SINAL_PERDIDO';
            }
          }

          // Retorna o objeto formatado de cada motorista para o frontend
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
      // Captura e registra qualquer erro interno, retornando status 500
      console.error('Erro no AdminController:', error);
      return res.status(500).json({ error: 'Erro ao carregar dados do dashboard.' });
    }
  }
}
