import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import requireKYC from '../middlewares/kycMiddleware.js'; // Or wherever your KYC middleware is
import Wallet from '../models/Wallet.js';
import User from '../models/User.js';
import walletController from '../controllers/walletController.js';
import logger from '../utils/logger.js';
import { formatResponse } from '../utils/helpers.js'; // Use consistent response format
import Decimal from 'decimal.js';

const router = express.Router();

// Route for sending funds internally to another user on the platform
// POST /api/wallet/send-internal
router.post('/send-internal', authenticate, requireKYC, walletController.sendInternalFunds);