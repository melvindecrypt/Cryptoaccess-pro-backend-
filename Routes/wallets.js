const express = require('express');
const router = express.Router();
const { authenticate }= require('../middlewares/AuthMiddleware);
const requireVerifiedEmail = require('../middlewares/requireVerifiedEmail');
const { requireKYC }= require('../middlewares/requireKYC');
const walletController = require('../controllers/walletController'); // Assuming this file
const { getDepositAddress } = require('../controllers/walletController');

// Routes
// Get the user's wallet details (View wallet)
router.get('/', authenticate, walletController.getWallet);

// Simulate deposit of funds
router.post('/deposit', authenticate, walletController.depositFunds);

// Withdraw funds (Requires KYC approval) - Create withdrawal request
router.post('/withdraw', authenticate, requireKYC, walletController.createWithdrawal);

// Get withdrawal history
router.get('/withdrawals', authenticate, walletController.getWithdrawalHistory);

router.get('/deposit-address', authenticate, walletController.getDepositAddress);
// Add other wallet routes here

// In routes/wallets.js
router.get('/balances', authenticate, walletController.getUserBalances);

// Route for sending funds internally to another user on the platform
// POST /api/wallet/send-internal
router.post('/send-internal',authenticate, requireKYC, walletController.sendInternalFunds);

// Route for sending funds externally
// POST /api/wallet/request-withdrawal
router.post('/request-withdrawal',authenticate, requireKYC, walletController.requestWithdrawal);

module.exports = router;

