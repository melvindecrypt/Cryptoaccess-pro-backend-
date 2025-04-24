const { formatResponse } = require('../utils/helpers');
const logger = require('../utils/logger');
const User = require('../models/User');
const Wallet = require('../models/Wallet');

// Supported currencies and max withdrawal limit
const SUPPORTED_CURRENCIES = ['BTC', 'ETH', 'USDT', 'BNB', 'SOL'];
const MAX_WITHDRAWAL = 1000000; // Maximum withdrawal limit

// Get Wallet Information
exports.getWallet = async (req, res) => {
  try {
    const userId = req.user._id;
    const wallet = await Wallet.findOne({ userId });

    if (!wallet) {
      return res.status(404).json(formatResponse(false, 'Wallet not found for user'));
    }

    res.json(formatResponse(true, 'Wallet fetched successfully', {
      balances: wallet.balances,
      transactions: wallet.transactions,
    }));
  } catch (error) {
    logger.error('Error fetching wallet: ' + error.message);
    res.status(500).json(formatResponse(false, 'Internal server error', {
      error: process.env.NODE_ENV === 'development' ? error.message : null
    }));
  }
};

// Simulate Deposit Funds
exports.depositFunds = async (req, res) => {
  const { currency, amount } = req.body;
  const userId = req.user._id;

  try {
    if (!currency || typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json(formatResponse(false, 'Invalid deposit data'));
    }

    if (!SUPPORTED_CURRENCIES.includes(currency)) {
      return res.status(400).json(formatResponse(false, `Unsupported currency. Supported: ${SUPPORTED_CURRENCIES.join(', ')}`));
    }

    const wallet = await Wallet.findOne({ userId });

    if (!wallet) {
      return res.status(404).json(formatResponse(false, 'Wallet not found'));
    }

    // Update wallet balance
    wallet.balances[currency] = (wallet.balances[currency] || 0) + amount;
    wallet.transactions.push({
      type: 'deposit',
      currency,
      amount,
      status: 'COMPLETED',
      timestamp: new Date(),
      transactionId: `DEP-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`
    });

    await wallet.save();

    logger.info(`Deposit received: ${currency} ${amount} for user ${userId}`);

    res.json(formatResponse(true, 'Deposit successful', {
      currency,
      amount,
      newBalance: wallet.balances[currency],
    }));
  } catch (error) {
    logger.error('Error processing deposit: ' + error.message);
    res.status(500).json(formatResponse(false, 'Internal server error', {
      error: process.env.NODE_ENV === 'development' ? error.message : null
    }));
  }
};

// Withdraw funds controller
exports.withdrawFunds = async (req, res) => {
  const session = await Wallet.startSession();
  session.startTransaction();

  try {
    const { currency, amount } = req.body;
    const userId = req.user._id;

    // Validate input
    if (!currency || typeof amount !== 'number') {
      return res.status(400).json(formatResponse(false, 'Valid currency and numeric amount required'));
    }

    if (amount <= 0 || amount > MAX_WITHDRAWAL) {
      return res.status(400).json(formatResponse(false, `Amount must be between 0.00000001 and ${MAX_WITHDRAWAL}`));
    }

    if (!SUPPORTED_CURRENCIES.includes(currency)) {
      return res.status(400).json(formatResponse(false, `Unsupported currency. Supported: ${SUPPORTED_CURRENCIES.join(', ')}`));
    }

    // Get user and wallet in transaction
    const [user, wallet] = await Promise.all([
      User.findById(userId).session(session),
      Wallet.findOne({ userId }).session(session)
    ]);

    // Verify user is Pro+ and KYC approved
    if (!user.isProPlus) {
      return res.status(403).json(formatResponse(false, 'Pro+ subscription required for withdrawals'));
    }

    if (user.kycStatus !== 'VERIFIED') {
      return res.status(403).json(formatResponse(false, 'KYC verification required for withdrawals'));
    }

    // Validate wallet balance with precision
    const currentBalance = Number(wallet.balances[currency].toFixed(8));
    const withdrawalAmount = Number(amount.toFixed(8));

    if (currentBalance < withdrawalAmount) {
      return res.status(400).json(formatResponse(false, `Insufficient ${currency} balance. Available: ${currentBalance}`));
    }

    // Create withdrawal request
    const withdrawalRequest = {
      type: 'withdrawal',
      amount: withdrawalAmount,
      currency,
      status: 'PENDING',
      timestamp: new Date(),
      requestId: `WD-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`
    };

    // Update wallet balance and transaction history
    wallet.balances[currency] = parseFloat((currentBalance - withdrawalAmount).toFixed(8));
    wallet.transactions.push(withdrawalRequest);

    // Save the updated wallet and commit the transaction
    await wallet.save({ session });
    await session.commitTransaction();

    logger.info(`Withdrawal request: ${withdrawalRequest.requestId} for user ${userId}`);

    res.json(formatResponse(true, 'Withdrawal request submitted', {
      requestId: withdrawalRequest.requestId,
      remainingBalance: wallet.balances[currency],
      currency
    }));

  } catch (error) {
    await session.abortTransaction();
    logger.error(`Withdrawal failed: ${error.message}`, {
      user: req.user._id,
      currency: req.body.currency
    });

    res.status(500).json(formatResponse(false, 'Internal server error', {
      error: process.env.NODE_ENV === 'development' ? error.message : null
    }));
  } finally {
    session.endSession();
  }
};