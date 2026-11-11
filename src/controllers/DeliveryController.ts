import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { parseCoords, parseEventDate, secondsBetween, toNumber } from '../utils/location';

const prisma = new PrismaClient();

// Se a última posição do motorista for mais antiga que isso, não usamos como
// "local onde ele estava quando recebeu a entrega" (seria um dado enganoso).
const ASSIGN_LOCATION_MAX_AGE_MS = 2 * 60 * 60 * 1000;

// Nunca devolver a senha do motorista nas respostas de entrega
const driverSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  lastLatitude: true,
  lastLongitude: true,
  lastLocationAt: true,
};

// Monta os campos de "atribuição" (hora + onde o motorista estava) quando uma entrega
// é entregue a um motorista.
async function buildAssignmentData(driverId: string) {
  const driver = await prisma.user.findUnique({
    where: { id: driverId },
    select: { lastLatitude: true, lastLongitude: true, lastLocationAt: true },
  });

  const isFresh =
    !!driver?.lastLocationAt &&
    Date.now() - driver.lastLocationAt.getTime() <= ASSIGN_LOCATION_MAX_AGE_MS;

  return {
    assignedAt: new Date(),
    assignedLatitude: isFresh ? (driver?.lastLatitude ?? null) : null,
    assignedLongitude: isFresh ? (driver?.lastLongitude ?? null) : null,
  };
}

function durationInfo(startedAt: Date | null, finishedAt: Date | null) {
  if (!startedAt || !finishedAt) return { durationSeconds: null, durationMinutes: null };
  const durationSeconds = secondsBetween(startedAt, finishedAt);
  return { durationSeconds, durationMinutes: Math.round(durationSeconds / 60) };
}

export class DeliveryController {
  // POST - CRIANDO NOVA ENTREGA
  async create(req: Request, res: Response) {
    try {
      const { boxCount, paymentMethod, changeFor, customerId, driverId } = req.body;

      const assignment = driverId ? await buildAssignmentData(driverId) : {};

      const newDelivery = await prisma.delivery.create({
        data: {
          boxCount,
          paymentMethod,
          changeFor,
          customerId,
          driverId,
          ...assignment,
        },
      });

      return res.status(201).json(newDelivery);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro interno do servidor ao criar a entrega.' });
    }
  }

  // GET - LISTAR TODAS AS ENTREGAS
  async list(req: Request, res: Response) {
    try {
      const deliveries = await prisma.delivery.findMany({
        include: {
          customer: true,
          driver: { select: driverSelect },
        },
      });
      return res.json(deliveries);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'ERRO AO BUSCAR AS ENTREGAS.' });
    }
  }

  // PUT - Motorista inicia a entrega
  // body: { driverId, latitude, longitude, accuracy?, occurredAt? }
  async start(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { driverId } = req.body;
      const coords = parseCoords(req.body.latitude, req.body.longitude);
      const startedAt = parseEventDate(req.body.occurredAt);

      const delivery = await prisma.delivery.findUnique({ where: { id } });
      if (!delivery) {
        return res.status(404).json({ error: 'Entrega não encontrada.' });
      }

      if (delivery.driverId && driverId && delivery.driverId !== driverId) {
        return res.status(403).json({ error: 'Esta entrega pertence a outro motorista.' });
      }

      if (delivery.status === 'DELIVERED') {
        return res.status(409).json({ error: 'Esta entrega já foi finalizada.' });
      }

      // Já iniciada (ex.: ação reenviada pela fila offline): não sobrescreve a hora/local originais
      if (delivery.status === 'IN_TRANSIT') {
        return res.json({
          message: 'Entrega já estava em rota.',
          alreadyStarted: true,
          delivery,
        });
      }

      const effectiveDriverId = delivery.driverId ?? driverId ?? null;

      // Se o motorista pegou uma entrega que ninguém tinha atribuído, a atribuição = início
      const assignmentFallback = delivery.assignedAt
        ? {}
        : {
            assignedAt: startedAt,
            assignedLatitude: coords?.latitude ?? null,
            assignedLongitude: coords?.longitude ?? null,
          };

      const updated = await prisma.delivery.update({
        where: { id },
        data: {
          status: 'IN_TRANSIT',
          driverId: effectiveDriverId,
          startedAt,
          startLatitude: coords?.latitude ?? null,
          startLongitude: coords?.longitude ?? null,
          ...assignmentFallback,
        },
        include: { customer: true, driver: { select: driverSelect } },
      });

      if (coords && effectiveDriverId) {
        await prisma.user.update({
          where: { id: effectiveDriverId },
          data: {
            lastLatitude: coords.latitude,
            lastLongitude: coords.longitude,
            lastLocationAt: startedAt,
          },
        });
      }

      return res.json({
        message: 'Entrega iniciada com sucesso! Rota em andamento.',
        locationSaved: !!coords,
        delivery: updated,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro interno ao iniciar a entrega.' });
    }
  }

  // PUT - Motorista finaliza a entrega
  // body: { driverId?, latitude, longitude, accuracy?, occurredAt? }
  async finish(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { driverId } = req.body;
      const coords = parseCoords(req.body.latitude, req.body.longitude);

      const delivery = await prisma.delivery.findUnique({ where: { id } });
      if (!delivery) {
        return res.status(404).json({ error: 'Entrega não encontrada.' });
      }

      if (delivery.driverId && driverId && delivery.driverId !== driverId) {
        return res.status(403).json({ error: 'Esta entrega pertence a outro motorista.' });
      }

      // Já finalizada (ex.: reenvio da fila offline): responde OK sem sobrescrever nada
      if (delivery.status === 'DELIVERED') {
        return res.json({
          message: 'Entrega já estava finalizada.',
          alreadyFinished: true,
          ...durationInfo(delivery.startedAt, delivery.finishedAt),
          delivery,
        });
      }

      if (!delivery.startedAt) {
        return res.status(409).json({ error: 'A entrega ainda não foi iniciada.' });
      }

      let finishedAt = parseEventDate(req.body.occurredAt);
      if (finishedAt.getTime() < delivery.startedAt.getTime()) {
        finishedAt = delivery.startedAt;
      }

      const updated = await prisma.delivery.update({
        where: { id },
        data: {
          status: 'DELIVERED',
          finishedAt,
          endLatitude: coords?.latitude ?? null,
          endLongitude: coords?.longitude ?? null,
        },
        include: { customer: true, driver: { select: driverSelect } },
      });

      if (coords && delivery.driverId) {
        await prisma.user.update({
          where: { id: delivery.driverId },
          data: {
            lastLatitude: coords.latitude,
            lastLongitude: coords.longitude,
            lastLocationAt: finishedAt,
          },
        });
      }

      return res.json({
        message: 'Entrega finalizada com sucesso!',
        locationSaved: !!coords,
        ...durationInfo(delivery.startedAt, finishedAt),
        delivery: updated,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro interno ao finalizar a entrega.' });
    }
  }

  // POST - App do motorista envia os pontos de GPS enquanto a entrega está em rota
  // body: { points: [{ latitude, longitude, speed?, heading?, accuracy?, recordedAt }] }
  async track(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { points } = req.body;

      if (!Array.isArray(points)) {
        return res.status(400).json({ error: 'Envie a lista "points".' });
      }

      const delivery = await prisma.delivery.findUnique({
        where: { id },
        select: { status: true, driverId: true },
      });
      if (!delivery) {
        return res.status(404).json({ error: 'Entrega não encontrada.' });
      }

      // Só guarda trajeto de entrega em rota
      if (delivery.status !== 'IN_TRANSIT') {
        return res.json({ saved: 0 });
      }

      const valid = points
        .slice(0, 200)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((p: any) => {
          const coords = parseCoords(p?.latitude, p?.longitude);
          if (!coords) return null;
          return {
            deliveryId: id,
            latitude: coords.latitude,
            longitude: coords.longitude,
            speed: toNumber(p.speed),
            heading: toNumber(p.heading),
            accuracy: toNumber(p.accuracy),
            recordedAt: parseEventDate(p.recordedAt),
          };
        })
        .filter((p): p is NonNullable<typeof p> => p !== null)
        .sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());

      if (valid.length === 0) {
        return res.json({ saved: 0 });
      }

      await prisma.deliveryTrackPoint.createMany({ data: valid });

      if (delivery.driverId) {
        const last = valid[valid.length - 1];
        await prisma.user.update({
          where: { id: delivery.driverId },
          data: {
            lastLatitude: last.latitude,
            lastLongitude: last.longitude,
            lastLocationAt: last.recordedAt,
          },
        });
      }

      return res.json({ saved: valid.length });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao salvar o trajeto.' });
    }
  }

  // GET - Linha do tempo completa da entrega (para o painel admin)
  async tracking(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const delivery = await prisma.delivery.findUnique({
        where: { id },
        include: {
          customer: true,
          driver: { select: driverSelect },
          trackPoints: { orderBy: { recordedAt: 'asc' } },
        },
      });

      if (!delivery) return res.status(404).json({ error: 'Entrega não encontrada.' });

      const point = (at: Date | null, latitude: number | null, longitude: number | null) => ({
        at,
        latitude,
        longitude,
      });

      return res.json({
        id: delivery.id,
        status: delivery.status,
        customer: delivery.customer,
        driver: delivery.driver,
        assigned: point(delivery.assignedAt, delivery.assignedLatitude, delivery.assignedLongitude),
        started: point(delivery.startedAt, delivery.startLatitude, delivery.startLongitude),
        finished: point(delivery.finishedAt, delivery.endLatitude, delivery.endLongitude),
        // atribuída -> iniciou (tempo parado) e iniciou -> finalizou (tempo de rota)
        waitingSeconds:
          delivery.assignedAt && delivery.startedAt
            ? secondsBetween(delivery.assignedAt, delivery.startedAt)
            : null,
        ...durationInfo(delivery.startedAt, delivery.finishedAt),
        path: delivery.trackPoints.map((p) => ({
          latitude: p.latitude,
          longitude: p.longitude,
          speed: p.speed,
          heading: p.heading,
          accuracy: p.accuracy,
          recordedAt: p.recordedAt,
        })),
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar o rastreamento da entrega.' });
    }
  }

  // GET - Listar Entregas por ID
  async getById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const delivery = await prisma.delivery.findUnique({
        where: { id },
        include: { customer: true, driver: { select: driverSelect } },
      });

      if (!delivery) return res.status(404).json({ error: 'Delivery não encontrada.' });
      return res.json({
        ...delivery,
        ...durationInfo(delivery.startedAt, delivery.finishedAt),
      });
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

  // PUT - Atualiza a entrega, como adicionar/trocar motorista
  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { boxCount, paymentMethod, changeFor, status, customerId, driverId } = req.body;

      let assignment = {};
      if (driverId !== undefined) {
        const current = await prisma.delivery.findUnique({
          where: { id },
          select: { driverId: true },
        });
        if (!current) return res.status(404).json({ error: 'Entrega não encontrada.' });

        if (driverId && driverId !== current.driverId) {
          // Atribuída a um (novo) motorista: registra hora e onde ele estava
          assignment = await buildAssignmentData(driverId);
        } else if (!driverId && current.driverId) {
          // Motorista removido
          assignment = { assignedAt: null, assignedLatitude: null, assignedLongitude: null };
        }
      }

      const updatedDelivery = await prisma.delivery.update({
        where: { id },
        data: {
          boxCount,
          paymentMethod,
          changeFor,
          status,
          customerId,
          driverId,
          ...assignment,
        },
      });

      return res.json(updatedDelivery);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao atualizar a entrega.' });
    }
  }
}
