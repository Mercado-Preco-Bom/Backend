import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { parseCoords } from '../utils/location';

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

  // PUT - App do motorista informa a posição atual (usada ao atribuir entregas e no mapa do admin)
  async updateLocation(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const coords = parseCoords(req.body.latitude, req.body.longitude);

      if (!coords) {
        return res.status(400).json({ error: 'Latitude/longitude inválidas.' });
      }

      await prisma.user.update({
        where: { id },
        data: {
          lastLatitude: coords.latitude,
          lastLongitude: coords.longitude,
          lastLocationAt: new Date(),
        },
      });

      return res.status(204).send();
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao atualizar a localização.' });
    }
  }

  // Rota Login
  async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
      }

      // Procura se o email existe no banco(Se o usuario existe)
      const user = await prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
      }

      // Ainda sem token, sem validação de seção
      if (user.password !== password) {
        return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
      }

      // Reposta com os dados do usuario com a cargo dele
      return res.json({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role, // ADMIN, DRIVER, CAIXA
        },
      });
    } catch (error) {
      console.error('Erro no login:', error);
      return res.status(500).json({ error: 'Erro interno no servidor ao fazer login.' });
    }
  }
}
