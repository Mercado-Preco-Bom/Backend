// Importa o construtor de rotas do Express e a classe de controle de usuários
import { Router } from 'express';
import { UserController } from '../controllers/UserController';

// Inicializa o roteador do Express e a instância do controlador de usuários
const router = Router();
const userController = new UserController();

// Rota POST para realizar o login de usuários no sistema (web e mobile)
router.post('/login', userController.login);

// Rota POST para cadastrar/criar um novo usuário no banco de dados
router.post('/', userController.create);

// Rota GET para listar todos os usuários cadastrados
router.get('/', userController.list);

// Rota GET dinâmica para buscar os dados de um usuário específico pelo ID
router.get('/:id', userController.getById);

// Rota PUT para atualizar a geolocalização em tempo real enviada pelo aplicativo do motorista
router.put('/:id/location', userController.updateLocation);

// Rota PUT para registrar a desconexão ou encerramento de sessão do motorista
router.put('/:id/disconnect', userController.disconnectDriver);

// Rota PUT para atualizar informações cadastrais de um usuário específico pelo ID
router.put('/:id', userController.update);

// Rota DELETE para remover um usuário do banco de dados pelo ID
router.delete('/:id', userController.delete);

// Exporta o roteador configurado para ser utilizado no arquivo principal do servidor
export default router;
