import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class CustomerController {
  // POST - Criar novo cliente (PDV)
  async create(req: Request, res: Response) {
    try {
      const { name, phone, street, number, neighborhood, reference } = req.body;

      // Cria o cliente no banco.
      const newCustomer = await prisma.customer.create({
        data: {
          name,
          phone,
          street,
          number,
          neighborhood,
          reference,
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

      const updatedCustomer = await prisma.customer.update({
        where: { id },
        data: { name, phone, street, number, neighborhood, reference },
      });

      return res.json(updatedCustomer);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro atualizar cliente.' });
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
