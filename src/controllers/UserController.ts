import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { parseCoords, parseEventDate } from '../utils/location';

const prisma = new PrismaClient();

export class UserController {
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

  async list(req: Request, res: Response) {
    try {
      const users = await prisma.user.findMany();
      return res.json(users);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar usuarios.' });
    }
  }

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

  async updateLocation(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const coords = parseCoords(req.body.latitude, req.body.longitude);

      if (!coords) {
        return res.status(400).json({ error: 'Latitude/longitude inválidas.' });
      }

      const lastLocationAt = parseEventDate(req.body.recordedAt);

      await prisma.user.update({
        where: { id },
        data: {
          lastLatitude: coords.latitude,
          lastLongitude: coords.longitude,
          lastLocationAt,
        },
      });

      return res.status(204).send();
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao atualizar a localização.' });
    }
  }

  async disconnectDriver(req: Request, res: Response) {
    try {
      const { id } = req.params;
      await prisma.user.update({
        where: { id },
        data: {
          lastLocationAt: new Date(0),
        },
      });
      return res.status(204).send();
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao desconectar motorista.' });
    }
  }

  async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
      }

      const cleanEmail = email.trim().toLowerCase();

      // Busca ignorando maiúsculas/minúsculas no Postgres
      const user = await prisma.user.findFirst({
        where: {
          email: {
            equals: cleanEmail,
            mode: 'insensitive',
          },
        },
      });

      if (!user || user.password !== password) {
        return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
      }

      return res.json({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      });
    } catch (error) {
      console.error('Erro no login:', error);
      return res.status(500).json({ error: 'Erro interno no servidor ao fazer login.' });
    }
  }
}
