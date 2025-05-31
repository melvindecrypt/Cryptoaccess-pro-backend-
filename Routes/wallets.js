import express from 'express';
import { authenticate } from '../middlewares/AuthMiddleware.js';
import walletController from '../controllers/walletController.js';

const router = express.Router();

// Routes

// Get the user's wallet details (View wallet)
router.get('/', authenticate, walletController.getWallet);

// Simulate deposit of funds
router.post('/deposit', authenticate, walletController.depositFunds);

// Get deposit address
router.get('/deposit-address', authenticate, walletController.getDepositAddress);

export default router;