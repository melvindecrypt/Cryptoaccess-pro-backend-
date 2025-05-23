// routes/investments.js
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/authMiddleware);
const requireVerifiedEmail = require('../middlewares/requireVerifiedEmail');

// Controllers (assume these are implemented in controllers/investmentController.js)
const { viewPlans, invest, trackInvestment } = require('../controllers/investmentController');

// Routes
// View available investment plans
router.get('/plans', authenticate, viewPlans);

// Start a new investment (does not require KYC approval)
router.post('/invest', authenticate, invest);

// Track user's current investments
router.get('/my-investments', authenticate, trackInvestment);

const investmentController = require('../controllers/investmentController');

router.get('/:id', auth, investmentController.getInvestmentDetails);
router.post('/:id/cancel', authenticate, investmentController.cancelInvestment);

module.exports = router;