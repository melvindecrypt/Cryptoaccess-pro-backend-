import express from 'express';
import subscriptionController from '../controllers/subscriptionController.js';
import { authenticate, isAdmin } from '../middlewares/authMiddleware.js';

const router = express.Router();

// User routes
router.post('/notify-payment', authenticate, subscriptionController.notifyPaymentForProPlus);

router.get('/pro-plus', authenticate, subscriptionController.getProPlusPlan);

// Admin routes
router.post('/confirm-payment', authenticate, isAdmin, subscriptionController.confirmPaymentForProPlus);

router.get('/pending-payments', authenticate, isAdmin, subscriptionController.getPendingPayments);

export default router;