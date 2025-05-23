// File: routes/withdrawal.js
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const withdrawalController = require('../controllers/withdrawalController');

// Withdraw funds (Requires Pro+ and KYC approval)
router.post('/', authenticate, withdrawalController.createWithdrawal);

module.exports = router;
