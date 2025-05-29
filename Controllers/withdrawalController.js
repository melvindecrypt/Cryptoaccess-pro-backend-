import Withdrawal from '../models/withdrawal.js';
import Wallet from '../models/wallet.js'
import { sendEmail } from '../utils/emailService.js';
import Currency from '../models/currency.js'; 
import User from '../models/user.js';
import { formatResponse } from '../utils/helpers.js';
import logger from '../utils/logger.js';
import Decimal from 'decimal.js';
import mongoose from 'mongoose';

// Unified currency validation using the Currency model
const validateCurrency = async (currency) => {
  const currencyData = await Currency.findOne({ symbol: currency.toUpperCase(), isActive: true });
  if (!currencyData) {
    throw new Error(`Unsupported currency: ${currency}`);
  }
  return currencyData.symbol; // Return the exact symbol from DB for consistency
};

// Merged and enhanced function: initiateWithdrawal
export const initiateWithdrawal = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { currency, amount, destinationAddress, withdrawalMethod } = req.body;
    const userId = req.user._id;
    const numericAmount = new Decimal(amount);

    const user = await User.findById(userId).session(session);
    if (!user) {
      return res.status(404).json(formatResponse(false, 'User not found'));
    }

    // Require Pro+ subscription and Verified/Approved KYC
    if (!user.isProPlus) {
      return res.status(403).json(formatResponse(false, 'Pro+ subscription required for withdrawals'));
    }
    if (user.kycStatus !== 'verified' && user.kycStatus !== 'approved') {
      return res.status(403).json(formatResponse(false, 'KYC verification required for withdrawals'));
    }

    const validatedCurrency = await validateCurrency(currency);

    if (!destinationAddress) {
      throw new Error('Destination address is required');
    }
    if (numericAmount.lessThanOrEqualTo(0)) {
      throw new Error('Amount must be positive');
    }

    if (!withdrawalMethod || !['bank', 'crypto', 'paypal'].includes(withdrawalMethod.toLowerCase())) {
        throw new Error('Valid withdrawal method is required (bank, crypto, or paypal)');
    }

    const wallet = await Wallet.findOne({ userId }).session(session);
    if (!wallet) {
      throw new Error('Wallet not found');
    }

    const currentBalance = new Decimal(wallet.balances.get(validatedCurrency) || 0);
    if (currentBalance.lessThan(numericAmount)) {
      return res.status(402).json(formatResponse(false, `Insufficient ${validatedCurrency} balance`));
    }

    // Deduct funds from Wallet
    wallet.balances.set(validatedCurrency, currentBalance.minus(numericAmount).toNumber());

    // Record transaction in Wallet.transactions
    const walletTransactionEntry = {
      type: 'withdrawal',
      currency: validatedCurrency,
      amount: numericAmount.toNumber(),
      destinationAddress,
      withdrawalMethod,
      status: 'PENDING',
      timestamp: new Date(),
      networkFee: withdrawalMethod.toLowerCase() === 'crypto' ? new Decimal(0.0005).toNumber() : 0, // Example fee
    };
    wallet.transactions.push(walletTransactionEntry);

    await wallet.save({ session });

    // Create a separate Withdrawal document for dedicated tracking
    const withdrawalDoc = await Withdrawal.create(
      [{
        user: user._id,
        currency: validatedCurrency,
        amount: numericAmount.toNumber(),
        destinationAddress,
        withdrawalMethod,
        status: 'PENDING',
      }],
      { session }
    );

    await session.commitTransaction();
    logger.info(`Withdrawal request initiated for user ${userId}: ${withdrawalDoc[0]._id}`);

    // Send email confirmation for withdrawal request
    try {
      await sendEmail({
        to: user.email,
        subject: 'Withdrawal Request Received',
        template: 'withdrawalRequested',
        data: {
          name: user.name,
          amount: numericAmount.toFixed(2),
          currency: validatedCurrency,
          recipientAddress: destinationAddress,
          withdrawalMethod: withdrawalMethod,
          status: 'Pending',
        },
      });
    } catch (emailError) {
      logger.error(`Error sending withdrawal request email to ${user.email}: ${emailError.message}`);
    }

    res.status(202).json(
      formatResponse(true, 'Withdrawal request initiated successfully. It will be processed shortly.', {
        withdrawalId: withdrawalDoc[0]._id,
        status: 'PENDING',
      })
    );
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Withdrawal initiation error for user ${req.user._id}: ${error.message}`, error);

    if (res.headersSent) {
      return;
    }

    res.status(400).json(formatResponse(false, error.message || 'An unexpected error occurred during withdrawal initiation.'));
  } finally {
    session.endSession();
  }
};

// Admin Notification for Withdrawal
export const notifyWithdrawalStatus = async (withdrawal, action) => {
  try {
    await notificationService.create(
      withdrawal.user,
      'withdrawal',
      `Withdrawal ${action}`,
      `Your ${withdrawal.currency} withdrawal has been ${action}`,
      {
        amount: withdrawal.amount,
        status: action,
      }
    );
  } catch (error) {
    logger.error(`Error sending withdrawal notification: ${error.message}`);
  }
};

// Get User Balances
export const getUserBalances = async (req, res) => {
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
