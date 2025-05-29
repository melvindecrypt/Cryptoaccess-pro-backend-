import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import withdrawalController from '../controllers/withdrawalController.js';

const router = express.Router();

// Get withdrawal history
router.get('/withdrawals', authenticate, walletController.getWithdrawalHistory);

// Withdraw funds (Requires KYC approval) - Create withdrawal request
router.post('/withdraw', authenticate, requireKYC, withdrawalController.initiateWithdrawal);


export default router;