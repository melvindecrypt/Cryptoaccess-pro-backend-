import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import withdrawalController from '../controllers/withdrawalController.js';

const router = express.Router();

// Withdraw funds (Requires Pro+ and KYC approval)
router.post('/', authenticate, withdrawalController.createWithdrawal);

// Route for requesting external withdrawal
// POST /api/wallet/request-withdrawal
router.post('/request-withdrawal', authenticate, requireKYC, walletController.requestWithdrawal);

// Get withdrawal history
router.get('/withdrawals', authenticate, walletController.getWithdrawalHistory);

// Withdraw funds (Requires KYC approval) - Create withdrawal request
router.post('/withdraw', authenticate, requireKYC, walletController.createWithdrawal);


export default router;