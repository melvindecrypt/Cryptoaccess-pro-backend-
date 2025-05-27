import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import withdrawalController from '../controllers/withdrawalController.js';

const router = express.Router();

// Withdraw funds (Requires Pro+ and KYC approval)
router.post('/', authenticate, withdrawalController.createWithdrawal);

export default router;