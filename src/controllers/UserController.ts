import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { parseCoords, parseEventDate } from '../utils/location';

const prisma = new PrismaClient();
// Chave secreta para gerar o token JWT (em produção, coloque isso no .env)
const JWT_SECRET = process.env.JWT_SECRET || 'precobom_super_secret_key_2026';

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
          role: (role || 'MOTORISTA') as any, 
        },
      });

      const { password: _, ...userWithoutPassword } = newUser;
      return res.status(201).json(userWithoutPassword);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro interno do servidor ao criar novo usuario.' });
    }
  }

  async list(req: Request, res: Response) {
    try {
      // Retorna todos os usuários, mas omitindo a senha
      const users = await prisma.user.findMany({
        select: { id: true, name: true, email: true, role: true, createdAt: true }
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
        select: { id: true, name: true, email: true, role: true, createdAt: true }
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

      const dataToUpdate: any = { name, email, role };

      // Se a senha foi enviada na requisição de update, criptografa ela também
      if (password) {
        dataToUpdate.password = await bcrypt.hash(password, 10);
      }

      const updatedUser = await prisma.user.update({
        where: { id },
        data: dataToUpdate,
      });

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

      // Se o usuário não existir
      if (!user) {
        return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
      }

      // 3. Compara a senha em texto (que veio do body) com o Hash (que está no banco)
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
      }

      // 4. Gera o token JWT para a sessão (válido por 7 dias)
      const token = jwt.sign(
        { id: user.id, role: user.role },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      // Remove a senha antes de devolver para o frontend
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