import { Router } from 'express';
import { AdminController } from '../controllers/AdminController';

const router = Router();
const adminController = new AdminController(); // ← Nome corrigido aqui

router.get('/admin/dashboard', adminController.getDashboard);

export default router;
