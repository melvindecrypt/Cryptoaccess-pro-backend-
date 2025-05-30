import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import requireKYC from '../middlewares/kycMiddleware.js';
import walletController from '../controllers/walletController.js';

const router = express.Router();

// Route for sending funds internally to another user
router.post('/send-internal', authenticate, requireKYC, walletController.sendInternalFunds);

export default router;