const express = require('express');
const router = express.Router();
const requireAuth = require('../middlewares/requireAuth');
const requireVerifiedEmail = require('../middlewares/requireVerifiedEmail');
const requireKYC = require('../middlewares/requireKYC');
const walletController = require('../controllers/walletController'); // Assuming this file

// Routes
// Get the user's wallet details (View wallet)
router.get('/', requireAuth, walletController.getWallet);

// Simulate deposit of funds
router.post('/deposit', requireAuth, walletController.depositFunds);

// Withdraw funds (Requires KYC approval) - Create withdrawal request
router.post('/withdraw', requireAuth, requireKYC, walletController.createWithdrawal);

// Get withdrawal history
router.get('/withdrawals', requireAuth, walletController.getWithdrawalHistory);

module.exports = router;
