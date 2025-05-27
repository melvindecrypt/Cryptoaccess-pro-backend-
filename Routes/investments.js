import express from 'express';
import { authenticate } from '../middlewares/authMiddleware.js';
import requireVerifiedEmail from '../middlewares/requireVerifiedEmail.js';
import investmentController from '../controllers/investmentController.js';

const router = express.Router();

// View available investment plans
router.get('/plans', authenticate, investmentController.viewPlans);

// Start a new investment
router.post('/invest', authenticate, requireVerifiedEmail, investmentController.invest);

// Track user's current investments
router.get('/my-investments', authenticate, investmentController.trackInvestment);

// View details of a specific investment
router.get('/:id', authenticate, investmentController.getInvestmentDetails);

// Cancel a specific investment
router.post('/:id/cancel', authenticate, investmentController.cancelInvestment);

export default router;