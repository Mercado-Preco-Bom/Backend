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
        return res.status(400).json({ error: 'This email is already in use.' });
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
      return res.status(500).json({ error: 'Internal server error while creating user.' });
    }
  }

  // GET - Listar todos usuarios
  async list(req: Request, res: Response) {
    try {
      const users = await prisma.user.findMany();
      return res.json(users);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Error fetching users.' });
    }
  }
}
