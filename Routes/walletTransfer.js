router.get('/deposit-address', authenticate, walletController.getDepositAddress);
router.post('/withdraw', authenticate, requireKYC, walletController.withdrawFunds);

const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const requireVerifiedEmail = require('../middlewares/requireVerifiedEmail');
const Wallet = require('../models/Wallet');
const { requireKYC } = require('../middleware/kycMiddleware'); // Or wherever your KYC middleware is
const walletController = require('../controllers/walletController
const User = require('../models/User');
const logger = require('../utils/logger');
const { formatResponse } = require('../utils/helpers'); // Use consistent response format
const Decimal = require('decimal.js');

// Supported currencies from your Wallet model
const SUPPORTED_CURRENCIES = ['BTC', 'ETH', 'USDT', 'BNB', 'SOL'];

// Transfer funds between wallets
router.post('/transfer', authMiddleware, async (req, res) => {
  const session = await Wallet.startSession();
  session.startTransaction();

  try {
    const { toWalletId, amount, currency } = req.body;
    const senderUserId = req.user._id;

    // Validate input
    if (!toWalletId || !amount || !currency) {
      return res.status(400).json(formatResponse(false, 'To wallet ID, amount, and currency are required'));
    }

    if (typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json(formatResponse(false, 'Amount must be a positive number'));
    }

    if (!SUPPORTED_CURRENCIES.includes(currency)) {
      return res.status(400).json(formatResponse(false, `Unsupported currency. Supported: ${SUPPORTED_CURRENCIES.join(', ')}`));
    }

    // Check sender restrictions
    const senderUser = await User.findById(senderUserId).session(session);
    if (!senderUser.isApproved || senderUser.kycStatus !== 'VERIFIED') {
      return res.status(403).json(formatResponse(false, 'Account must be approved and KYC verified to transfer funds'));
    }

    // Find and validate sender wallet
    const senderWallet = await Wallet.findOne({ userId: senderUserId }).session(session);
    if (!senderWallet || senderWallet.balances[currency] < amount) {
      return res.status(400).json(formatResponse(false, 'Insufficient funds or invalid currency'));
    }

    // Find and validate recipient wallet
    const recipientWallet = await Wallet.findById(toWalletId).session(session);
    if (!recipientWallet || !SUPPORTED_CURRENCIES.includes(currency)) {
      return res.status(404).json(formatResponse(false, 'Recipient wallet not found or invalid currency'));
    }

    // Prevent self-transfer
    if (senderWallet._id.equals(recipientWallet._id)) {
      return res.status(400).json(formatResponse(false, 'Cannot transfer to same wallet'));
    }

    // Create transaction ID for audit tracking
    const transactionId = `TX-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Perform the transfer using Decimal for precision
    const senderBalance = new Decimal(senderWallet.balances[currency]);
    const recipientBalance = new Decimal(recipientWallet.balances[currency]);

    senderWallet.balances[currency] = senderBalance.minus(amount).toFixed(8);
    recipientWallet.balances[currency] = recipientBalance.plus(amount).toFixed(8);


    // Record transactions
    const transactionData = {
      type: 'transfer',
      amount,
      currency,
      timestamp: new Date(),
      transactionId,
      counterparty: senderUserId // For recipient's record
    };

    senderWallet.transactions.push({
      ...transactionData,
      amount: -amount,
      counterparty: recipientWallet.userId
    });

    recipientWallet.transactions.push(transactionData);

    // Save changes
    await Promise.all([
      senderWallet.save({ session }),
      recipientWallet.save({ session })
    ]);

    await session.commitTransaction();
    logger.info(`Transfer successful: ${transactionId}`);

    res.json(formatResponse(true, 'Transfer successful', {
      transactionId,
      newBalance: senderWallet.balances[currency],
      currency
    }));

  } catch (error) {
    await session.abortTransaction();
    logger.error(`Transfer failed: ${error.message}`);
    res.status(500).json(formatResponse(false, 'Transfer failed', { 
      error: process.env.NODE_ENV === 'development' ? error.message : null 
    }));
  } finally {
    session.endSession();
  }
});

module.exports = router;