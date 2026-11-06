import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class UserController {
  // POST - Cria novo usuario
  async create(req: Request, res: Response) {
    try {
      const { name, email, password, role } = req.body;

      const userExists = await prisma.user.findUnique({ where: { email } });
      if (userExists) {
        return res.status(400).json({ error: 'Este e-mail já está em uso.' });
      }

      const newUser = await prisma.user.create({
        data: {
          name,
          email,
          password,
          role,
        },
      });

      return res.status(201).json(newUser);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro interno do servidor ao criar novo usuario.' });
    }
  }

  // GET - Listar todos usuarios
  async list(req: Request, res: Response) {
    try {
      const users = await prisma.user.findMany();
      return res.json(users);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar usuarios.' });
    }
  }

  // GET -Listar usuario por ID
  async getById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const user = await prisma.user.findUnique({ where: { id } });

      if (!user) return res.status(404).json({ error: 'Usuario não encontrado.' });
      return res.json(user);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar usuario por ID.' });
    }
  }

  // PUT - Editar usuario
  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { name, email, password, role } = req.body;

      const updatedUser = await prisma.user.update({
        where: { id },
        data: { name, email, password, role },
      });

      return res.json(updatedUser);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao atualizar usuario.' });
    }
  }

  // DELETE - Deletar usuario
  async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;
      await prisma.user.delete({ where: { id } });

      return res.status(204).send();
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao deletar usuario.' });
    }
  }
}
