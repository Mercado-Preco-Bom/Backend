import { Router } from 'express';
import { DeliveryController } from '../controllers/DeliveryController';

const router = Router();
const deliveryController = new DeliveryController();

// Rota para criar entregas
router.post('/deliveries', deliveryController.create);
// Rota para puxar as entregas
router.get('/deliveries', deliveryController.list);
// Rota para iniciar a entrega, o ID é passado pela URL
router.put('/deliveries/:id/start', deliveryController.start);
//Rota para finalizar a entrega
router.put('/deliveries/:id/finish', deliveryController.finish);
//Rota para Buscar as entregas por ID
router.get('/deliveries/:id', deliveryController.getById);
// Deletar Entregas
router.delete('/deliveries/:id', deliveryController.delete);
export default router;
