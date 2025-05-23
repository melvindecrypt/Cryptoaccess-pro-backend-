const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/authMiddleware');
const requireVerifiedEmail = require('../middlewares/requireVerifiedEmail');
const investmentController = require('../controllers/investmentController');

// View available investment plans
router.get('/plans', authenticate, investmentController.viewPlans);

// Start a new investment
router.post('/invest', authenticate, investmentController.invest);

// Track user's current investments
router.get('/my-investments', authenticate, investmentController.trackInvestment);

// View details of a specific investment
router.get('/:id', authenticate, investmentController.getInvestmentDetails);

// Cancel a specific investment
router.post('/:id/cancel', authenticate, investmentController.cancelInvestment);

module.exports = router;