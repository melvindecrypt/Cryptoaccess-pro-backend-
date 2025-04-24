// routes/wallet.js
const express = require('express');
const router = express.Router();
const requireAuth = require('../middlewares/requireAuth');
const requireKYC = require('../middlewares/requireKYC');

// Controllers (assume these are implemented in controllers/walletController.js)
const { getWallet, depositFunds, withdrawFunds } = require('../controllers/walletController');

// Routes
// Get the user's wallet details (View wallet)
router.get('/', requireAuth, getWallet);

// Simulate deposit of funds
router.post('/deposit', requireAuth, depositFunds);

// Withdraw funds (Requires KYC approval)
router.post('/withdraw', requireAuth, requireKYC, withdrawFunds);

module.exports = router;