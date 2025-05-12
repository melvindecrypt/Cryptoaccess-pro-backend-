const express = require('express');
const router = express.Router();
const { Authenticate }= require('../middlewares/AuthMiddleware);
const requireVerifiedEmail = require('../middlewares/requireVerifiedEmail');
const requireKYC = require('../middlewares/requireKYC');
const walletController = require('../controllers/walletController'); // Assuming this file

// Routes
// Get the user's wallet details (View wallet)
router.get('/', Authenticate, walletController.getWallet);

// Simulate deposit of funds
router.post('/deposit', Authenticate, walletController.depositFunds);

// Withdraw funds (Requires KYC approval) - Create withdrawal request
router.post('/withdraw', Authenticate, requireKYC, walletController.createWithdrawal);

// Get withdrawal history
router.get('/withdrawals', Authenticate, walletController.getWithdrawalHistory);

module.exports = router;
