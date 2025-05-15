// File: routes/withdrawal.js
const express = require('express');
const router = express.Router();
const { Authenticate } = require('../middleware/authMiddleware');
const withdrawalController = require('../controllers/withdrawalController');

// Withdraw funds (Requires Pro+ and KYC approval)
router.post('/', Authenticate, withdrawalController.createWithdrawal);

module.exports = router;
