import Withdrawal from '../models/withdrawal.js';
import User from '../models/user.js';
import { formatResponse } from '../utils/helpers.js';
import logger from '../utils/logger.js';
import Decimal from 'decimal.js';
import mongoose from 'mongoose';

// Create Withdrawal
export const createWithdrawal = async (req, res) => {
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
    const withdrawal = await Withdrawal.create(
      [
        {
          user: user._id,
          currency,
          amount: numericAmount.toNumber(),
          destinationAddress,
        },
      ],
      { session }
    );

    // Lock funds (deduct from available balance)
    user.virtualBalances[currency] = balance.minus(numericAmount).toNumber();
    await user.save({ session });

    await session.commitTransaction();
    logger.info(`Withdrawal requested: ${withdrawal[0]._id}`);

    res.json(
      formatResponse(true, 'Withdrawal request successful', {
        withdrawalId: withdrawal[0]._id,
        status: 'success',
      })
    );
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error creating withdrawal request: ${error.message}`);
    res.status(400).json(formatResponse(false, error.message));
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

// Request Withdrawal
export const requestWithdrawal = async (req, res) => {
  const session = await Wallet.startSession();
  session.startTransaction();

  try {
    const { currency, amount, recipientAddress, withdrawalMethod } = req.body;
    const userId = req.user._id;
    const numericAmount = new Decimal(amount);
    const validatedCurrency = await validateCurrency(currency);

    if (!recipientAddress) {
      throw new Error('Recipient address is required');
    }
    if (numericAmount.lessThanOrEqualTo(0)) {
      throw new Error('Amount must be positive');
    }

    if (!withdrawalMethod || !['bank', 'crypto', 'paypal'].includes(withdrawalMethod.toLowerCase())) {
      throw new Error('Valid withdrawal method is required');
    }

    const wallet = await Wallet.findOne({ userId }).session(session);
    if (!wallet) {
      throw new Error('Wallet not found');
    }

    const currentBalance = new Decimal(wallet.balances.get(validatedCurrency) || 0);
    if (currentBalance.lessThan(numericAmount)) {
      throw new Error(`Insufficient ${validatedCurrency} balance`);
    }

    // Debit funds from sender's wallet immediately
    wallet.balances.set(validatedCurrency, currentBalance.minus(numericAmount).toNumber());

    // Record the withdrawal request as PENDING
    wallet.transactions.push({
      type: 'withdrawal',
      currency: validatedCurrency,
      amount: numericAmount.toNumber(),
      recipientAddress,
      withdrawalMethod,
      status: 'PENDING',
      timestamp: new Date(),
    });

    await wallet.save({ session });
    await session.commitTransaction();

    // Optional: Send email confirmation for withdrawal request
    const user = await User.findById(userId);
    if (user) {
      try {
        await sendEmail({
          to: user.email,
          subject: 'Withdrawal Request Received',
          template: 'withdrawalRequested',
          data: {
            name: user.name,
            amount: numericAmount.toFixed(2),
            currency: validatedCurrency,
            recipientAddress: recipientAddress,
            withdrawalMethod: withdrawalMethod,
          },
        });
      } catch (emailError) {
        logger.error(`Error sending withdrawal request email: ${emailError.message}`);
      }
    }

    res.status(202).json(
      formatResponse(true, 'Withdrawal request initiated successfully. It will be processed shortly.', {
        withdrawalId: wallet.transactions[wallet.transactions.length - 1]._id,
        status: 'PENDING',
      })
    );
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Withdrawal request error for user ${req.user._id}: ${error.message}`, error);

    if (res.headersSent) {
      return;
    }

    res.status(400).json(formatResponse(false, error.message || 'An unexpected error occurred during withdrawal request.'));
  } finally {
    session.endSession();
  }
};

// Withdraw Funds
export const withdrawFunds = async (req, res) => {
  const session = await Wallet.startSession();
  session.startTransaction();

  try {
    const { currency, amount, destinationAddress } = req.body;
    const user = await User.findById(req.user._id);
    const numericAmount = new Decimal(amount);

    // Validate request
    await validateCurrency(currency);
    if (!destinationAddress) {
      throw new Error('Destination address required');
    }
    if (!user.isProPlus || user.kycStatus !== 'VERIFIED') {
      throw new Error('Pro+ subscription and KYC verification required');
    }

    const wallet = await Wallet.findOne({ userId: user._id }).session(session);
    const currentBalance = new Decimal(wallet.balances.get(currency) || 0);

    if (currentBalance.lessThan(numericAmount)) {
      throw new Error(`Insufficient ${currency} balance`);
    }

    // Update balance and record transaction
    wallet.balances.set(currency, currentBalance.minus(numericAmount).toNumber());
    wallet.transactions.push({
      type: 'withdrawal',
      currency,
      amount: numericAmount.toNumber(),
      destinationAddress,
      status: 'PENDING',
      timestamp: new Date(),
      networkFee: new Decimal(0.0005).toNumber(), // Example fee
    });

    await wallet.save({ session });
    await session.commitTransaction();

    res.json(
      formatResponse(true, 'Withdrawal request received', {
        processingTime: '1-3 business days',
        transactionFee: 0.0005,
      })
    );
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Withdrawal failed: ${error.message}`);
    res.status(400).json(formatResponse(false, error.message));
  } finally {
    session.endSession();
  }
};
