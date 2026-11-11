import { Router } from 'express';
import { UserController } from '../controllers/UserController';

const router = Router();
const userController = new UserController();

router.post('/login', userController.login);
router.post('/', userController.create);
router.get('/', userController.list);
router.get('/:id', userController.getById);
router.put('/:id/location', userController.updateLocation);
router.put('/:id/disconnect', userController.disconnectDriver);
router.put('/:id', userController.update);
router.delete('/:id', userController.delete);

export default router;
