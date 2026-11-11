import { Router } from 'express';
import { UserController } from '../controllers/UserController';

const router = Router();
const userController = new UserController();

// Rota de criação de usuarios
router.post('/users', userController.create);
// Rota para puxar os usuarios
router.get('/users', userController.list);
//Listar usuarios pelo ID
router.get('/users/:id', userController.getById);
//Atualizar usuarios
router.put('/users/:id', userController.update);
// Motorista atualiza a própria localização
router.put('/users/:id/location', userController.updateLocation);
// Deletar usuarios
router.delete('/users/:id', userController.delete);
//Rota de login do usuario
router.post('/login', userController.login);

export default router;
