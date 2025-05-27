import express from 'express';
import currencyController from '../controllers/currencyController.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = express.Router();

// Get All Currencies Route
router.get('/currencies', authenticate, currencyController.getAllCurrencies);

export default router;