import { Router } from 'express';
import { CustomerController } from '../controllers/ClientController';

const router = Router();
const customerController = new CustomerController();

// Rota para criar novo cliente
router.post('/customers', customerController.create);
// Rota para listar clientes
router.get('/customers', customerController.list);
// Rota para Listar clientes por ID
router.get('/customers/:id', customerController.getById);
// Rota para Atualizar clientes
router.put('/customers/:id', customerController.update);
// Motorista marca a localização exata do cliente (sítio etc.)
router.put('/customers/:id/location', customerController.setLocation);
// Rota para deletar Clientes
router.delete('/customers/:id', customerController.delete);

export default router;
