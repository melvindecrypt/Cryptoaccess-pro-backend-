// routes/wallet.js
const express = require('express');
const router = express.Router();
const requireAuth = require('../middlewares/requireAuth');
const requireVerifiedEmail = require('../middlewares/requireVerifiedEmail');
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

// File: routes/wallets.js
router.post('/withdraw', 
  requireAuth, 
  requireKYC, 
  withdrawalController.createWithdrawal
);

// File: routes/wallets.js
router.get('/withdrawals', requireAuth, async (req, res) => {
  try {
    const withdrawals = await Withdrawal.find({ user: req.user._id })
      .sort({ createdAt: -1 });

    res.json(formatResponse(true, 'Withdrawal history', withdrawals));
  } catch (error) {
    res.status(500).json(formatResponse(false, error.message));
  }
});