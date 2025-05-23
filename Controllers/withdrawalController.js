controllers/withdrawalController.js
const Withdrawal = require('../models/withdrawal');
const User = require('../models/user');
const { formatResponse } = require('../utils/helpers');
const logger = require('../utils/logger');
const Decimal = require('decimal.js');
const mongoose = require('mongoose');

exports.createWithdrawal = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { currency, amount, destinationAddress } = req.body;
    const numericAmount = new Decimal(amount);

    // Validate withdrawal
    const user = await User.findById(req.user._id).session(session);
    if (!user) {
      throw new Error('User not found');
    }
    if (!user.isProPlus) {
      return res.status(403).json(formatResponse(false, 'Pro+ subscription required for withdrawals'));
    }
    if (user.kycStatus !== 'approved') {
      return res.status(403).json(formatResponse(false, 'KYC verification required for withdrawals'));
    }

    // Check balance
    const balance = new Decimal(user.virtualBalances[currency] || 0);
    if (balance.lessThan(numericAmount)) {
      return res.status(402).json(formatResponse(false, 'Insufficient balance'));
    }

    // Create withdrawal request
    const withdrawal = await Withdrawal.create([{
      user: user._id,
      currency,
      amount: numericAmount.toNumber(),
      destinationAddress
    }], { session });

    // Lock funds (deduct from available balance)
    user.virtualBalances[currency] = balance.minus(numericAmount).toNumber();
    await user.save({ session });

    await session.commitTransaction();
    logger.info(`Withdrawal requested: ${withdrawal[0]._id}`);

    res.json(formatResponse(true, 'Withdrawal request successful', {
      withdrawalId: withdrawal[0]._id,
      status: 'success'
    }));

  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error creating withdrawal request: ${error.message}`);
    res.status(400).json(formatResponse(false, error.message));
  } finally {
    session.endSession();
  }
};

// In admin withdrawal handler
await notificationService.create(
  withdrawal.user,
  'withdrawal',
  `Withdrawal ${action}`,
  `Your ${withdrawal.currency} withdrawal has been ${action}`,
  { 
    amount: withdrawal.amount,
    status: action 
  }
);

// In controllers/walletController.js

exports.getUserBalances = async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ userId: req.user._id })
      .select('balances')
      .lean();

    if (!wallet) {
      return res.status(404).json(formatResponse(false, 'Wallet not found'));
    }

    // Filter out currencies with zero balance
    const nonZeroBalances = Object.fromEntries(
      Object.entries(wallet.balances).filter(([_, balance]) => new Decimal(balance).greaterThan(0))
    );

    res.json(formatResponse(true, 'User balances retrieved', nonZeroBalances));
  } catch (error) {
    logger.error(`Error fetching user balances: ${error.message}`);
    res.status(500).json(formatResponse(false, 'Server error while fetching user balances'));
  }
};
