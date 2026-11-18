import { Router } from 'express';
import { AdminController } from '../controllers/AdminController';

const router = Router();
const adminController = new AdminController();

router.get('/admin/dashboard', adminController.getDashboard);
router.get('/admin/history', adminController.getHistory);

export default router;
