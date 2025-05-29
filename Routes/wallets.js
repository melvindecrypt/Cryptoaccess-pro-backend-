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

// Get deposit address
router.get('/deposit-address', authenticate, walletController.getDepositAddress);

// Get user balances
router.get('/balances', authenticate, walletController.getUserBalances);

// Route for sending funds internally to another user on the platform
// POST /api/wallet/send-internal
router.post('/send-internal', authenticate, requireKYC, walletController.sendInternalFunds);

export default router;