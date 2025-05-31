import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import requireVerifiedEmail from '../middlewares/requireVerifiedEmail.js';
import { requireKYC } from '../middlewares/requireKYC.js';
import withdrawalController from '../controllers/withdrawalController.js';

const router = express.Router();

// Withdraw funds (Requires KYC approval) - Create withdrawal request
router.post('/withdraw', authenticate, requireKYC, requireVerifiedEmail, withdrawalController.initiateWithdrawal);

// Get user balances
router.get('/balances', authenticate, requireKYC, requireVerifiedEmail, withdrawalController.getUserBalances);

export default router;