const { formatResponse } = require('../utils/helpers');
const logger = require('../utils/logger');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Decimal = require('decimal.js');

const SUPPORTED_CURRENCIES = ['BTC', 'ETH', 'USDT', 'BNB', 'SOL'];
const MAX_WITHDRAWAL = new Decimal(1000000);

exports.getWallet = async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ userId: req.user._id });
    if (!wallet) return res.status(404).json(formatResponse(false, 'Wallet not found'));
    
    res.json(formatResponse(true, 'Wallet fetched', {
      balances: wallet.balances,
      transactions: wallet.transactions.slice(-20) // Last 20 transactions
    }));
  } catch (error) {
    logger.error(`Wallet fetch error: ${error.message}`);
    res.status(500).json(formatResponse(false, 'Server error'));
  }
};

exports.depositFunds = async (req, res) => {
  try {
    const { currency, amount } = req.body;
    const numericAmount = new Decimal(amount);

    if (!SUPPORTED_CURRENCIES.includes(currency) || numericAmount.lessThanOrEqualTo(0)) {
      return res.status(400).json(formatResponse(false, 'Invalid deposit data'));
    }

    const wallet = await Wallet.findOneAndUpdate(
      { userId: req.user._id },
      { 
        $inc: { [`balances.${currency}`]: numericAmount.toNumber() },
        $push: {
          transactions: {
            type: 'deposit',
            currency,
            amount: numericAmount.toNumber(),
            status: 'COMPLETED',
            timestamp: new Date()
          }
        }
      },
      { new: true }
    );

    res.json(formatResponse(true, 'Deposit successful', {
      newBalance: wallet.balances[currency]
    }));
  } catch (error) {
    logger.error(`Deposit error: ${error.message}`);
    res.status(500).json(formatResponse(false, 'Deposit failed'));
  }
};

exports.withdrawFunds = async (req, res) => {
  const session = await Wallet.startSession();
  session.startTransaction();

  try {
    const { currency, amount } = req.body;
    const user = await User.findById(req.user._id);
    const wallet = await Wallet.findOne({ userId: user._id }).session(session);

    // Validation checks
    if (!user.isProPlus || user.kycStatus !== 'VERIFIED') {
      throw new Error('Pro+ and KYC verification required');
    }

    const currentBalance = new Decimal(wallet.balances[currency] || 0);
    const withdrawalAmount = new Decimal(amount);

    if (currentBalance.lessThan(withdrawalAmount)) {
      throw new Error('Insufficient funds');
    }

    // Update balance
    wallet.balances[currency] = currentBalance.minus(withdrawalAmount).toNumber();
    
    // Record transaction
    wallet.transactions.push({
      type: 'withdrawal',
      amount: withdrawalAmount.toNumber(),
      currency,
      status: 'PENDING',
      timestamp: new Date()
    });

    await wallet.save({ session });
    await session.commitTransaction();

    res.json(formatResponse(true, 'Withdrawal pending approval', {
      remainingBalance: wallet.balances[currency]
    }));
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Withdrawal failed: ${error.message}`);
    res.status(400).json(formatResponse(false, error.message));
  } finally {
    session.endSession();
  }
};