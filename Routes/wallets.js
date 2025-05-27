import express from 'express';
import { authenticate } from '../middlewares/AuthMiddleware.js';
import requireVerifiedEmail from '../middlewares/requireVerifiedEmail.js';
import { requireKYC } from '../middlewares/requireKYC.js';
import walletController from '../controllers/walletController.js';

const router = express.Router();

// Routes

// Get the user's wallet details (View wallet)
router.get('/', authenticate, walletController.getWallet);

// Simulate deposit of funds
router.post('/deposit', authenticate, walletController.depositFunds);

// Withdraw funds (Requires KYC approval) - Create withdrawal request
router.post('/withdraw', authenticate, requireKYC, walletController.createWithdrawal);

// Get withdrawal history
router.get('/withdrawals', authenticate, walletController.getWithdrawalHistory);

// Get deposit address
router.get('/deposit-address', authenticate, walletController.getDepositAddress);

// Get user balances
router.get('/balances', authenticate, walletController.getUserBalances);

// Route for sending funds internally to another user on the platform
// POST /api/wallet/send-internal
router.post('/send-internal', authenticate, requireKYC, walletController.sendInternalFunds);

// Route for requesting external withdrawal
// POST /api/wallet/request-withdrawal
router.post('/request-withdrawal', authenticate, requireKYC, walletController.requestWithdrawal);

export default router;