const { formatResponse } = require('../utils/helpers');
const logger = require('../utils/logger');
const User = require('../models/user');
const Wallet = require('../models/wallet');
const Currency = require('../models/currency');
const Decimal = require('decimal.js');
const Transaction = require('../models/transaction');
const { formatResponse } = require('../utils/helpers');
const { sendEmail } = require('../utils/emailService');
const mongoose = require('mongoose');

// Supported currencies with real wallet addresses (for deposit/receive)
const REAL_WALLET_ADDRESSES = Object.freeze({
  BTC: "bc1qrhmqgnwml62udh5c5wnyukx65rdtqdsa58p54l",
  ETH: "0xEe19FeE35ef7257c5Bcd8a1206dB6b1fCdf8e767",
  SOL: "ChbMRwr4xbH9hQSJA5Ei5MmRWAjn5MPUsVpNUMabsf5K",
  BNB: "0xEe19FeE35ef7257c5Bcd8a1206dB6b1fCdf8e767",
  USDT: "0xEe19FeE35ef7257c5Bcd8a1206dB6b1fCdf8e767",
  USDC: "0xEe19FeE35ef7257c5Bcd8a1206dB6b1fCdf8e767",
  DAI: "0xEe19FeE35ef7257c5Bcd8a1206dB6b1fCdf8e767",
  XRP: "rGcSBHz3dURpsh3Tg4y2qpbMMpMaxTMQL7",
  DOGE: "DJWWvsfk7cZLFjeWhb9KDyustcZ4vVu7ik",
  TRX: "TJ3JRojmo9USXSZ7Sindzycz15EHph3ZYP",
  LTC: "ltc1qp36qqd669xnvtmehyst3ht9suu8z73qasgnxps",
  MNT: "0xEe19FeE35ef7257c5Bcd8a1206dB6b1fCdf8e767"
});

// Unified currency validation using the Currency model
const validateCurrency = async (currency) => {
  const currencyData = await Currency.findOne({ symbol: currency.toUpperCase(), isActive: true });
  if (!currencyData) {
    throw new Error(`Unsupported currency: ${currency}`);
  }
  return currencyData;
};

exports.getWallet = async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ userId: req.user._id })
      .select('balances transactions')
      .lean();

    if (!wallet) {
      return res.status(404).json(formatResponse(false, 'Wallet not found'));
    }

    res.json(formatResponse(true, 'Wallet retrieved successfully', {
      balances: wallet.balances,
      recentTransactions: wallet.transactions.slice(-20)
    }));
  } catch (error) {
    logger.error(`Wallet fetch error: ${error.message}`);
    res.status(500).json(formatResponse(false, 'Server error while fetching wallet'));
  }
};

exports.depositFunds = async (req, res) => {
  try {
    const { currency, amount } = req.body;
    const numericAmount = new Decimal(amount);

    // Validate input
    await validateCurrency(currency);
    if (numericAmount.lessThanOrEqualTo(0)) {
      return res.status(400).json(formatResponse(false, 'Amount must be positive'));
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
            timestamp: new Date(),
            targetAddress: REAL_WALLET_ADDRESSES[currency] // Still using the fixed addresses
          }
        }
      },
      { new: true, runValidators: true }
    );

    res.json(formatResponse(true, 'Deposit initialized', {
      depositAddress: REAL_WALLET_ADDRESSES[currency],
      requiredConfirmations: 3,
      estimatedArrival: Date.now() + 3600000 // 1 hour
    }));
  } catch (error) {
    logger.error(`Deposit error: ${error.message}`);
    res.status(400).json(formatResponse(false, error.message));
  }
};

exports.withdrawFunds = async (req, res) => {
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
      networkFee: new Decimal(0.0005).toNumber() // Example fee
    });

    await wallet.save({ session });
    await session.commitTransaction();

    res.json(formatResponse(true, 'Withdrawal request received', {
      processingTime: '1-3 business days',
      transactionFee: 0.0005
    }));
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Withdrawal failed: ${error.message}`);
    res.status(400).json(formatResponse(false, error.message));
  } finally {
    session.endSession();
  }
};

exports.getDepositAddress = async (req, res) => {
  try {
    const { currency } = req.query;
    await validateCurrency(currency);

    res.json(formatResponse(true, 'Deposit address retrieved', {
      currency,
      address: REAL_WALLET_ADDRESSES[currency],
      memo: 'Use this address for deposits only',
      qrCode: `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${REAL_WALLET_ADDRESSES[currency]}`
    }));
  } catch (error) {
    res.status(400).json(formatResponse(false, error.message));
  }
};

// Helper function (if it's not already in utils/helpers)
async function validateCurrency(currency) {
    // Implement your currency validation logic here
    // e.g., check against a list of supported currencies
    const supportedCurrencies = ['USD', 'EUR', 'NGN']; // Example
    if (!supportedCurrencies.includes(currency.toUpperCase())) {
        throw new Error(`Unsupported currency: ${currency}`);
    }
    return currency.toUpperCase();
}


// --- New: For internal P2P transfers within the platform ---
exports.sendInternalFunds = async (req, res) => {
  const session = await Wallet.startSession();
  session.startTransaction();

  try {
    const { currency, amount, recipientIdentifier } = req.body;
    const senderUserId = req.user._id;
    const numericAmount = new Decimal(amount);

    const validatedCurrency = await validateCurrency(currency); // Use the helper
    if (!recipientIdentifier) {
      throw new Error('Recipient identifier (username or email) is required');
    }
    if (numericAmount.lessThanOrEqualTo(0)) {
      throw new Error('Amount must be positive');
    }

    const senderUser = await User.findById(senderUserId).session(session); // Get sender user for identifier
    if (!senderUser) {
        throw new Error('Sender user not found');
    }

    const senderWallet = await Wallet.findOne({ userId: senderUserId }).session(session);
    if (!senderWallet) {
      throw new Error('Sender wallet not found');
    }

    const currentSenderBalance = new Decimal(senderWallet.balances.get(validatedCurrency) || 0);
    if (currentSenderBalance.lessThan(numericAmount)) {
      throw new Error(`Insufficient ${validatedCurrency} balance`);
    }

    // Identify the recipient user
    const recipientUser = await User.findOne({ $or: [{ username: recipientIdentifier }, { email: recipientIdentifier }] }).session(session);
    if (!recipientUser) {
      throw new Error('Recipient user not found with provided identifier');
    }
    if (recipientUser._id.equals(senderUserId)) {
      throw new Error('Cannot send funds to yourself');
    }

    const recipientWallet = await Wallet.findOne({ userId: recipientUser._id }).session(session);
    if (!recipientWallet) {
      throw new Error('Recipient wallet not found');
    }

    // Update sender's balance
    senderWallet.balances.set(validatedCurrency, currentSenderBalance.minus(numericAmount).toNumber());
    await senderWallet.save({ session });

    // Update recipient's balance
    const currentRecipientBalance = new Decimal(recipientWallet.balances.get(validatedCurrency) || 0);
    recipientWallet.balances.set(validatedCurrency, currentRecipientBalance.plus(numericAmount).toNumber());
    await recipientWallet.save({ session });

    // Record transactions for both sender and receiver
    // Ensure you have a 'Transaction' model defined and imported
    await Transaction.create([{
      userId: senderUserId,
      walletId: senderWallet._id,
      type: 'send',
      currency: validatedCurrency,
      amount: numericAmount.toNumber(),
      recipientUserId: recipientUser._id,
      recipientIdentifier: recipientIdentifier, // Store the identifier used
      status: 'COMPLETED',
    }, {
      userId: recipientUser._id,
      walletId: recipientWallet._id,
      type: 'receive',
      currency: validatedCurrency,
      amount: numericAmount.toNumber(),
      senderUserId,
      senderIdentifier: senderUser.username || senderUser.email, // Use sender's username/email
      status: 'COMPLETED',
    }], { session }); // Use create with array for bulk insert in session

    await session.commitTransaction();

    // Optional: Send email notifications (consider making this non-blocking)
    try {
        await sendEmail({
            to: senderUser.email,
            subject: 'Funds Sent Successfully',
            template: 'fundsSent', // Create this template
            data: {
                name: senderUser.name,
                amount: numericAmount.toFixed(2),
                currency: validatedCurrency,
                recipient: recipientIdentifier
            }
        });
        await sendEmail({
            to: recipientUser.email,
            subject: 'Funds Received',
            template: 'fundsReceived', // Create this template
            data: {
                name: recipientUser.name,
                amount: numericAmount.toFixed(2),
                currency: validatedCurrency,
                sender: senderUser.username || senderUser.email // Or sender's name
            }
        });
    } catch (emailError) {
        logger.error(`Error sending fund transfer emails: ${emailError.message}`);
    }


    res.status(200).json(formatResponse(true, 'Funds sent successfully to recipient.'));

  } catch (error) {
    await session.abortTransaction();
    logger.error(`Internal fund transfer error for user ${req.user._id}: ${error.message}`, error); // Log full error object
    // Check if the response was already sent by a previous catch or validation
    if (res.headersSent) {
        return;
    }
    res.status(400).json(formatResponse(false, error.message || 'An unexpected error occurred during internal fund transfer.'));
  } finally {
    session.endSession();
  }
};

// --- New: For external withdrawals / sending funds out of the platform ---
exports.requestWithdrawal = async (req, res) => {
  const session = await Wallet.startSession();
  session.startTransaction();

  try {
    const { currency, amount, recipientAddress, withdrawalMethod } = req.body; // Added withdrawalMethod
    const userId = req.user._id;
    const numericAmount = new Decimal(amount);

    const validatedCurrency = await validateCurrency(currency);
    if (!recipientAddress) {
      throw new Error('Recipient address is required');
    }
    if (numericAmount.lessThanOrEqualTo(0)) {
      throw new Error('Amount must be positive');
    }
    // Add validation for withdrawalMethod if applicable (e.g., 'bank', 'crypto', 'paypal')
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
      type: 'withdrawal', // More specific type
      currency: validatedCurrency,
      amount: numericAmount.toNumber(),
      recipientAddress,
      withdrawalMethod, // Store the method
      status: 'PENDING', // This is crucial for external transfers
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
                template: 'withdrawalRequested', // Create this template
                data: {
                    name: user.name,
                    amount: numericAmount.toFixed(2),
                    currency: validatedCurrency,
                    recipientAddress: recipientAddress,
                    withdrawalMethod: withdrawalMethod
                }
            });
        } catch (emailError) {
            logger.error(`Error sending withdrawal request email: ${emailError.message}`);
        }
    }


    res.status(202).json(formatResponse(true, 'Withdrawal request initiated successfully. It will be processed shortly.', {
        withdrawalId: wallet.transactions[wallet.transactions.length - 1]._id, // Return ID of the new transaction
        status: 'PENDING'
    }));

  } catch (error) {
    await session.abortTransaction();
    logger.error(`Withdrawal request error for user ${req.user._id}: ${error.message}`, error);
    // Check if the response was already sent by a previous catch or validation
    if (res.headersSent) {
        return;
    }
    res.status(400).json(formatResponse(false, error.message || 'An unexpected error occurred during withdrawal request.'));
  } finally {
    session.endSession();
  }
};

// ... other wallet functions (deposit, getBalance, etc.)
