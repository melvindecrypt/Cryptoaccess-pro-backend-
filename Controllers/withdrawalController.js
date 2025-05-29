import Withdrawal from '../models/withdrawal.js';
import Wallet from '../models/wallet.js'
import { sendEmail } from '../utils/emailService.js';
import User from '../models/user.js';
import { formatResponse } from '../utils/helpers.js';
import logger from '../utils/logger.js';
import Decimal from 'decimal.js';
import mongoose from 'mongoose';






// Assuming validateCurrency is defined elsewhere or directly in this file
// const validateCurrency = async (currency) => { ... }; // Or import if from a helper file

// Unified currency validation using the Currency model (if not already imported)
// Assuming this function is accessible or imported from a helper file
const validateCurrency = async (currency) => {
    // This needs to interact with your Currency model to fetch active currencies
    // For this example, let's assume a dummy validation or ensure it's imported
    // from where it's defined (e.g., walletController.js)
    // If Currency model is imported in this file, use it:
    // const currencyData = await Currency.findOne({ symbol: currency.toUpperCase(), isActive: true });
    // if (!currencyData) {
    //   throw new Error(`Unsupported currency: ${currency}`);
    // }
    // return currency.toUpperCase(); // For now, just return uppercase
    // In a real app, this should query your Currency model for validity
    const allowedCurrencies = ['BTC', 'ETH', 'SOL', 'BNB', 'USDT', 'USDC', 'DAI', 'XRP', 'DOGE', 'TRX', 'LTC', 'MNT'];
    if (!allowedCurrencies.includes(currency.toUpperCase())) {
        throw new Error(`Unsupported currency: ${currency}`);
    }
    return currency.toUpperCase();
};


// New Merged Function: initiateWithdrawal
export const initiateWithdrawal = async (req, res) => {
  const session = await mongoose.startSession(); // Use mongoose.startSession() directly
  session.startTransaction();

  try {
    const { currency, amount, destinationAddress, withdrawalMethod } = req.body;
    const userId = req.user._id;
    const numericAmount = new Decimal(amount);

    // --- Core Validations (from both createWithdrawal and requestWithdrawal) ---
    const user = await User.findById(userId).session(session);
    if (!user) {
      // Use consistent formatResponse for all API responses
      return res.status(404).json(formatResponse(false, 'User not found'));
    }

    // Explicitly require Pro+ subscription and Verified KYC
    if (!user.isProPlus) {
      return res.status(403).json(formatResponse(false, 'Pro+ subscription required for withdrawals'));
    }
    // Using 'verified' as the status from your previous context, assuming 'approved' is equivalent or preferred
    // Adjust 'verified' to 'approved' if 'approved' is the final KYC status for withdrawal
    if (user.kycStatus !== 'verified' && user.kycStatus !== 'approved') {
      return res.status(403).json(formatResponse(false, 'KYC verification required for withdrawals'));
    }

    const validatedCurrency = await validateCurrency(currency); // Validate currency against supported list

    if (!destinationAddress) {
      throw new Error('Destination address is required');
    }
    if (numericAmount.lessThanOrEqualTo(0)) {
      throw new Error('Amount must be positive');
    }

    // Validate withdrawal method if provided, or default to 'crypto' if not specified for crypto addresses
    // This depends on whether you always expect 'withdrawalMethod' or infer it.
    // For this merge, let's make it mandatory if you support multiple types.
    if (!withdrawalMethod || !['bank', 'crypto', 'paypal'].includes(withdrawalMethod.toLowerCase())) {
        throw new Error('Valid withdrawal method is required (bank, crypto, or paypal)');
    }


    const wallet = await Wallet.findOne({ userId }).session(session);
    if (!wallet) {
      throw new Error('Wallet not found');
    }

    // Balance check from Wallet model (prioritizing Wallet balances over virtualBalances on User)
    const currentBalance = new Decimal(wallet.balances.get(validatedCurrency) || 0);
    if (currentBalance.lessThan(numericAmount)) {
      // Consistent status code for insufficient balance
      return res.status(402).json(formatResponse(false, `Insufficient ${validatedCurrency} balance`));
    }

    // --- Deduct funds from Wallet (from requestWithdrawal/withdrawFunds logic) ---
    wallet.balances.set(validatedCurrency, currentBalance.minus(numericAmount).toNumber());

    // --- Record transaction in Wallet.transactions (from requestWithdrawal/withdrawFunds logic) ---
    const walletTransactionEntry = {
      type: 'withdrawal',
      currency: validatedCurrency,
      amount: numericAmount.toNumber(),
      destinationAddress, // Use destinationAddress from request body
      withdrawalMethod, // Include withdrawalMethod
      status: 'PENDING', // All new requests are pending
      timestamp: new Date(),
      networkFee: withdrawalMethod === 'crypto' ? new Decimal(0.0005).toNumber() : 0, // Example fee, adjust as needed
    };
    wallet.transactions.push(walletTransactionEntry);

    await wallet.save({ session });

    // --- Create a separate Withdrawal document (from createWithdrawal logic) ---
    // This is optional but good for dedicated withdrawal tracking and admin review
    const withdrawalDoc = await Withdrawal.create(
      [{
        user: user._id,
        currency: validatedCurrency,
        amount: numericAmount.toNumber(),
        destinationAddress,
        withdrawalMethod, // Store method in dedicated withdrawal doc
        status: 'PENDING', // Initial status
        // You might add more fields here relevant to the dedicated Withdrawal model
      }],
      { session }
    );

    await session.commitTransaction();
    logger.info(`Withdrawal request initiated for user ${userId}: ${withdrawalDoc[0]._id}`);

    // Optional: Send email confirmation for withdrawal request (from requestWithdrawal)
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
          status: 'Pending', // Email should reflect pending status
        },
      });
    } catch (emailError) {
      logger.error(`Error sending withdrawal request email to ${user.email}: ${emailError.message}`);
    }

    res.status(202).json( // Use 202 Accepted for requests that will be processed
      formatResponse(true, 'Withdrawal request initiated successfully. It will be processed shortly.', {
        withdrawalId: withdrawalDoc[0]._id, // Return the ID of the dedicated withdrawal document
        status: 'PENDING',
        // You might include estimated processing time or fees here
      })
    );
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Withdrawal initiation error for user ${req.user._id}: ${error.message}`, error);

    // Prevent "Cannot set headers after they are sent to the client" error
    if (res.headersSent) {
      return;
    }

    res.status(400).json(formatResponse(false, error.message || 'An unexpected error occurred during withdrawal initiation.'));
  } finally {
    session.endSession();
  }
};

// You can now safely delete the original `createWithdrawal` and `withdrawFunds` functions
// from this file, as their functionality is now covered by `initiateWithdrawal`.

// Keep other functions as they are
export const notifyWithdrawalStatus = async (withdrawal, action) => { /* ... */ };
export const getUserBalances = async (req, res) => { /* ... */ };
// ... potentially other functions like getDepositAddress, depositFunds etc.







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
