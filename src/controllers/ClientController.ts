import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

import { parseCoords, parseEventDate } from '../utils/location';

const prisma = new PrismaClient();

const clean = (value: unknown): string | null => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text === '' ? null : text;
};

export class CustomerController {
  // POST - Criar novo cliente (PDV)
  async create(req: Request, res: Response) {
    try {
      const { name, phone, street, number, neighborhood, reference } = req.body;
      const isRural = req.body.isRural === true || req.body.isRural === 'true';
      const coords = parseCoords(req.body.latitude, req.body.longitude);

      if (!name || !String(name).trim()) {
        return res.status(400).json({ error: 'Informe o nome do cliente.' });
      }
      if (!neighborhood || !String(neighborhood).trim()) {
        return res.status(400).json({ error: 'Informe o bairro / localidade.' });
      }
      // Sítio não precisa de rua e número; cliente da cidade precisa
      if (!isRural && (!clean(street) || !clean(number))) {
        return res.status(400).json({ error: 'Informe a rua e o número (ou marque como sítio).' });
      }

      const newCustomer = await prisma.customer.create({
        data: {
          name,
          phone,
          street: clean(street),
          number: clean(number),
          neighborhood,
          reference,
          isRural,
          ...(coords ? { ...coords, locationUpdatedAt: new Date() } : {}),
        },
      });

      return res.status(201).json(newCustomer);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro interno do servidor ao criar um cliente.' });
    }
  }

  // GET - Listar todos os Clientes
  async list(req: Request, res: Response) {
    try {
      const customers = await prisma.customer.findMany();
      return res.json(customers);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao Listar Clientes.' });
    }
  }

  // GET - Listar cliente por ID
  async getById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const customer = await prisma.customer.findUnique({ where: { id } });

      if (!customer) return res.status(404).json({ error: 'Cliente não encontrado.' });
      return res.json(customer);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro buscar cliente por ID.' });
    }
  }

  // PUT - Atualizar Cliente
  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { name, phone, street, number, neighborhood, reference } = req.body;
      const isRural =
        req.body.isRural === undefined
          ? undefined
          : req.body.isRural === true || req.body.isRural === 'true';

      const updatedCustomer = await prisma.customer.update({
        where: { id },
        data: {
          name,
          phone,
          street: street === undefined ? undefined : clean(street),
          number: number === undefined ? undefined : clean(number),
          neighborhood,
          reference,
          isRural,
        },
      });

      return res.json(updatedCustomer);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro atualizar cliente.' });
    }
  }

  // PUT - O motorista marca (ou troca) a localização exata do cliente, estando no local
  async setLocation(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const coords = parseCoords(req.body.latitude, req.body.longitude);
      if (!coords) return res.status(400).json({ error: 'Latitude/longitude inválidas.' });

      const updated = await prisma.customer.update({
        where: { id },
        data: { ...coords, locationUpdatedAt: parseEventDate(req.body.recordedAt) },
      });
      return res.json(updated);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao salvar a localização do cliente.' });
    }
  }

  // DELETE - Deletar Cliente
  async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;
      await prisma.customer.delete({ where: { id } });

      return res.status(204).send();
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao deletar cliente.' });
    }
  }
}
