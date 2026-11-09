import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class DeliveryController {
  // POST - CRIANDO NOVA ENTREGA
  async create(req: Request, res: Response) {
    try {
      const { boxCount, paymentMethod, changeFor, customerId, driverId } = req.body;

      // Cria a entrega associando ao ID do cliente criado anteriormente
      const newDelivery = await prisma.delivery.create({
        data: {
          boxCount,
          paymentMethod,
          changeFor,
          customerId,
          driverId, // Pode ser null se a entrega ainda não tiver motorista
        },
      });

      return res.status(201).json(newDelivery);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro interno do servidor ao criar a entrega.' });
    }
  }

  // GET - lISTAR TODAS AS ENTREGAS
  async list(req: Request, res: Response) {
    try {
      // O include traz automaticamente os dados completos do cliente e do motorista junto com a entrega
      const deliveries = await prisma.delivery.findMany({
        include: {
          customer: true,
          driver: true,
        },
      });
      return res.json(deliveries);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'ERRO AO BUSCAR AS ENTREGAS.' });
    }
  }

  // PUT - Motorista iniciar a entrega
  async start(req: Request, res: Response) {
    try {
      const { id } = req.params; // ID da entrega na URL
      const { driverId, latitude, longitude } = req.body;

      // Atualiza os dados básicos
      await prisma.delivery.update({
        where: { id },
        data: {
          status: 'IN_TRANSIT',
          driverId: driverId,
          startedAt: new Date(),
        },
      });

      // Salva o GPS no PostGIS usando SQL
      if (latitude && longitude) {
        await prisma.$executeRaw`
          UPDATE "Delivery"
          SET "startCoordinates" = ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)
          WHERE id = ${id}
        `;
      }

      return res.json({ message: 'Entrega iniciada com sucesso! Rota em andamento.' });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro interno ao iniciar a entrega.' });
    }
  }

  // PUT - Motorista finaliza a entrega
  async finish(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { latitude, longitude } = req.body;

      // bUSCA A ENTRE PARA VER SE JA FOI INICIADA
      const delivery = await prisma.delivery.findUnique({ where: { id } });

      // IFS PARA VALIDAR ISSO
      if (!delivery) {
        return res.status(404).json({ error: 'Entrega não encontrada.' });
      }

      if (!delivery.startedAt) {
        return res.status(400).json({ error: 'A entrega ainda não foi iniciada.' });
      }

      // Calcula o tempo total em minutos
      const finishedAt = new Date();
      const durationInMinutes = Math.round(
        (finishedAt.getTime() - delivery.startedAt.getTime()) / 60000,
      );

      // Atualiza o status e a hora final
      await prisma.delivery.update({
        where: { id },
        data: {
          status: 'DELIVERED',
          finishedAt: finishedAt,
        },
      });

      // Salva a coordenada final DA ENTREGA no PostGIS usando SQL
      if (latitude && longitude) {
        await prisma.$executeRaw`
          UPDATE "Delivery"
          SET "endCoordinates" = ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)
          WHERE id = ${id}
        `;
      }

      return res.json({
        message: 'Entrega finalizada com sucesso!',
        durationMinutes: durationInMinutes,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro interno ao finalizar a entrega.' });
    }
  }

  // GET - Listar Entregas por ID
  async getById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const delivery = await prisma.delivery.findUnique({
        where: { id },
        include: { customer: true, driver: true },
      });

      if (!delivery) return res.status(404).json({ error: 'Delivery não encontrada.' });
      return res.json(delivery);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar a entrega.' });
    }
  }

  // DELETE - Deletar Entrega
  async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;
      await prisma.delivery.delete({ where: { id } });

      return res.status(204).send();
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao excluir entrega.' });
    }
  }

  // PUT - Atualiza a entrega, como adicionar motorista
  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { boxCount, paymentMethod, changeFor, status, customerId, driverId } = req.body;

      const updatedDelivery = await prisma.delivery.update({
        where: { id },
        data: {
          boxCount,
          paymentMethod,
          changeFor,
          status,
          customerId,
          driverId,
        },
      });

      return res.json(updatedDelivery);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao atualizar a entrega.' });
    }
  }
}
