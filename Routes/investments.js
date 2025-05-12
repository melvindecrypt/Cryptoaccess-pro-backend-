// routes/investments.js
const express = require('express');
const router = express.Router();
const {Authenticate} = require('../middlewares/authMiddleware);
const requireVerifiedEmail = require('../middlewares/requireVerifiedEmail');

// Controllers (assume these are implemented in controllers/investmentController.js)
const { viewPlans, invest, trackInvestment } = require('../controllers/investmentController');

// Routes
// View available investment plans
router.get('/plans', Authenticate, viewPlans);

// Start a new investment (does not require KYC approval)
router.post('/invest', Authenticate, invest);

// Track user's current investments
router.get('/my-investments', authenticate, trackInvestment);

module.exports = router;


const express = require('express');
const router = express.Router();
const investmentController = require('../controllers/investmentController');
const {Authenticate} = require('../middleware/authMiddleware');

router.get('/:id', auth, investmentController.getInvestmentDetails);
router.post('/:id/cancel', Authenticate, investmentController.cancelInvestment);

module.exports = router;