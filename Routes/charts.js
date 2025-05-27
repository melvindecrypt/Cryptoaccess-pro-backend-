import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import { getChartData } from '../controllers/chartController.js';

const router = express.Router();

// Chart Data Route
router.get('/', authenticate, getChartData);

export default router;