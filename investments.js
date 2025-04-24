// routes/investments.js
const express = require('express');
const router = express.Router();
const requireAuth = require('../middlewares/requireAuth');
const requireKYC = require('../middlewares/requireKYC');

// Controllers (assume these are implemented in controllers/investmentController.js)
const { viewPlans, invest, trackInvestment } = require('../controllers/investmentController');

// Routes
// View available investment plans
router.get('/plans', requireAuth, viewPlans);

// Start a new investment (Requires KYC approval)
router.post('/invest', requireAuth, requireKYC, invest);

// Track user's current investments
router.get('/my-investments', requireAuth, trackInvestment);

module.exports = router;