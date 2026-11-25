import { Request, Response } from 'express';
import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { parseCoords, parseEventDate, toNumber } from '../utils/location';
import { processDriverPosition } from '../utils/baseTrips';

const prisma = new PrismaClient();
// Chave secreta para gerar o token JWT (em produção, coloque isso no .env)
const JWT_SECRET = process.env.JWT_SECRET || 'precobom_super_secret_key_2026';

// Traduz o cargo vindo do frontend (em português) para o Enum do banco (em inglês)
const getPrismaRole = (roleString?: string): Role => {
  if (roleString === 'ADMIN') return Role.ADMIN;
  if (roleString === 'CAIXA' || roleString === 'CASHIER') return Role.CASHIER;
  return Role.DRIVER; // MOTORISTA é o padrão
};

export class UserController {
  async create(req: Request, res: Response) {
    try {
      const { name, email, password, role } = req.body;

      const userExists = await prisma.user.findUnique({ where: { email } });
      if (userExists) {
        return res.status(400).json({ error: 'Este e-mail já está em uso.' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const newUser = await prisma.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          role: getPrismaRole(role), // Aplica a tradução para o Enum do Prisma
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password: _, ...userWithoutPassword } = newUser;
      return res.status(201).json(userWithoutPassword);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro interno do servidor ao criar novo usuario.' });
    }
  }

  async list(req: Request, res: Response) {
    try {
      const users = await prisma.user.findMany({
        select: { id: true, name: true, email: true, role: true, createdAt: true },
      });
      return res.json(users);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar usuarios.' });
    }
  }

  async getById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const user = await prisma.user.findUnique({
        where: { id },
        select: { id: true, name: true, email: true, role: true, createdAt: true },
      });

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

      const dataToUpdate: { name?: string; email?: string; role?: Role; password?: string } = {
        name,
        email,
      };

      if (role) {
        dataToUpdate.role = getPrismaRole(role);
      }

      if (password) {
        dataToUpdate.password = await bcrypt.hash(password, 10);
      }

      const updatedUser = await prisma.user.update({
        where: { id },
        data: dataToUpdate,
      });

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password: _, ...userWithoutPassword } = updatedUser;
      return res.json(userWithoutPassword);
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

      // Cerca virtual: o servidor decide se o motorista saiu/voltou ao mercado
      await processDriverPosition(id, coords, lastLocationAt, toNumber(req.body.accuracy));

      return res.status(204).send();
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao atualizar a localização.' });
    }
  }

  // Mantida por compatibilidade com versões antigas do app: a cerca virtual agora é calculada
  // no servidor a cada /location. Aqui só fechamos a saída em aberto, se houver.
  async arrivedAtBase(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const arrivedAt = parseEventDate(req.body.arrivedAt);
      const open = await prisma.driverTrip.findFirst({ where: { driverId: id, returnedAt: null } });
      if (open) {
        await prisma.driverTrip.update({
          where: { id: open.id },
          data: {
            returnedAt: arrivedAt.getTime() < open.leftAt.getTime() ? open.leftAt : arrivedAt,
          },
        });
      }
      await prisma.user.update({ where: { id }, data: { atBase: true, atBaseSince: arrivedAt } });
      return res.status(201).json({ message: 'Retorno à base registrado com sucesso.' });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao registrar chegada na base.' });
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

      const user = await prisma.user.findFirst({
        where: {
          email: {
            equals: cleanEmail,
            mode: 'insensitive',
          },
        },
      });

      if (!user) {
        return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
      }

      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
      }

      const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password: _, ...userWithoutPassword } = user;

      return res.json({
        user: userWithoutPassword,
        token,
      });
    } catch (error) {
      console.error('Erro no login:', error);
      return res.status(500).json({ error: 'Erro interno no servidor ao fazer login.' });
    }
  }
}
