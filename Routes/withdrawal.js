import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import withdrawalController from '../controllers/withdrawalController.js';

const router = express.Router();

// Withdraw funds (Requires KYC approval) - Create withdrawal request
router.post('/withdraw', authenticate, requireKYC, withdrawalController.initiateWithdrawal);

// Get user balances
router.get('/balances', authenticate, withdrawalController.getUserBalances);

export default router;