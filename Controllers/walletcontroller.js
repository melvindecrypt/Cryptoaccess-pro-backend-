import { formatResponse } from '../utils/helpers.js';
import logger from '../utils/logger.js';
import User from '../models/user.js';
import Wallet from '../models/wallet.js';
import Currency from '../models/currency.js';
import Decimal from 'decimal.js';
import Transaction from '../models/transaction.js';
import { sendEmail } from '../utils/emailService.js';
import mongoose from 'mongoose';

// Supported currencies with real wallet addresses (for deposit/receive)
const REAL_WALLET_ADDRESSES = Object.freeze({
  BTC: 'bc1qrhmqgnwml62udh5c5wnyukx65rdtqdsa58p54l',
  ETH: '0xEe19FeE35ef7257c5Bcd8a1206dB6b1fCdf8e767',
  SOL: 'ChbMRwr4xbH9hQSJA5Ei5MmRWAjn5MPUsVpNUMabsf5K',
  BNB: '0xEe19FeE35ef7257c5Bcd8a1206dB6b1fCdf8e767',
  USDT: '0xEe19FeE35ef7257c5Bcd8a1206dB6b1fCdf8e767',
  USDC: '0xEe19FeE35ef7257c5Bcd8a1206dB6b1fCdf8e767',
  DAI: '0xEe19FeE35ef7257c5Bcd8a1206dB6b1fCdf8e767',
  XRP: 'rGcSBHz3dURpsh3Tg4y2qpbMMpMaxTMQL7',
  DOGE: 'DJWWvsfk7cZLFjeWhb9KDyustcZ4vVu7ik',
  TRX: 'TJ3JRojmo9USXSZ7Sindzycz15EHph3ZYP',
  LTC: 'ltc1qp36qqd669xnvtmehyst3ht9suu8z73qasgnxps',
  MNT: '0xEe19FeE35ef7257c5Bcd8a1206dB6b1fCdf8e767',
});

// Unified currency validation using the Currency model
const validateCurrency = async (currency) => {
  const currencyData = await Currency.findOne({ symbol: currency.toUpperCase(), isActive: true });
  if (!currencyData) {
    throw new Error(`Unsupported currency: ${currency}`);
  }
  return currencyData;
};

// Get Wallet
export const getWallet = async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ userId: req.user._id })
      .select('balances transactions')
      .lean();
    if (!wallet) {
      return res.status(404).json(formatResponse(false, 'Wallet not found'));
    }
    res.json(
      formatResponse(true, 'Wallet retrieved successfully', {
        balances: wallet.balances,
        recentTransactions: wallet.transactions.slice(-20),
      })
    );
  } catch (error) {
    logger.error(`Wallet fetch error: ${error.message}`);
    res.status(500).json(formatResponse(false, 'Server error while fetching wallet'));
  }
};

// Deposit Funds
export const depositFunds = async (req, res) => {
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
            targetAddress: REAL_WALLET_ADDRESSES[currency],
          },
        },
      },
      { new: true, runValidators: true }
    );

    res.json(
      formatResponse(true, 'Deposit initialized', {
        depositAddress: REAL_WALLET_ADDRESSES[currency],
        requiredConfirmations: 3,
        estimatedArrival: Date.now() + 3600000, // 1 hour
      })
    );
  } catch (error) {
    logger.error(`Deposit error: ${error.message}`);
    res.status(400).json(formatResponse(false, error.message));
  }
};

// Get Deposit Address
export const getDepositAddress = async (req, res) => {
  try {
    const { currency } = req.query;
    await validateCurrency(currency);

    res.json(
      formatResponse(true, 'Deposit address retrieved', {
        currency,
        address: REAL_WALLET_ADDRESSES[currency],
        memo: 'Use this address for deposits only',
        qrCode: `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data= ${REAL_WALLET_ADDRESSES[currency]}`,
      })
    );
  } catch (error) {
    res.status(400).json(formatResponse(false, error.message));
  }
};

// Enhanced Function: sendInternalFunds
export const sendInternalFunds = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { currency, amount, recipientIdentifier } = req.body;
    const senderUserId = req.user._id;
    const numericAmount = new Decimal(amount);

    // 1. Validate Input
    if (!recipientIdentifier) {
      return res.status(400).json(formatResponse(false, 'Recipient identifier (username or email) is required'));
    }
    if (numericAmount.lessThanOrEqualTo(0)) {
      return res.status(400).json(formatResponse(false, 'Amount must be positive'));
    }

    const validatedCurrencySymbol = await validateCurrency(currency);

    // 2. Find Sender User and Wallet
    const senderUser = await User.findById(senderUserId).session(session);
    if (!senderUser) {
      return res.status(404).json(formatResponse(false, 'Sender user not found.'));
    }
    // Sender KYC and Pro+ status checks are handled by `requireKYC` middleware at the route level.

    const senderWallet = await Wallet.findOne({ userId: senderUserId }).session(session);
    if (!senderWallet) {
      return res.status(404).json(formatResponse(false, 'Sender wallet not found.'));
    }

    // 3. Check Sender Balance
    const currentSenderBalance = new Decimal(senderWallet.balances.get(validatedCurrencySymbol) || 0);
    if (currentSenderBalance.lessThan(numericAmount)) {
      return res.status(402).json(formatResponse(false, `Insufficient ${validatedCurrencySymbol} balance.`));
    }

    // 4. Identify Recipient User and Wallet
    const recipientUser = await User.findOne({
      $or: [{ username: recipientIdentifier }, { email: recipientIdentifier }],
    }).session(session);

    if (!recipientUser) {
      return res.status(404).json(formatResponse(false, 'Recipient user not found with provided identifier.'));
    }
    if (recipientUser._id.equals(senderUserId)) {
      return res.status(400).json(formatResponse(false, 'Cannot send funds to yourself.'));
    }

    // --- UPDATED: Recipient KYC Check Message ---
    if (recipientUser.kycStatus !== 'verified' && recipientUser.kycStatus !== 'approved') {
      return res.status(403).json(formatResponse(false, 'User cannot receive funds, due to KYC Compliances.'));
    }
    // --- END UPDATED ---

    const recipientWallet = await Wallet.findOne({ userId: recipientUser._id }).session(session);
    if (!recipientWallet) {
      return res.status(404).json(formatResponse(false, 'Recipient wallet not found.'));
    }

    // 5. Perform Balance Updates (Atomic)
    senderWallet.balances.set(validatedCurrencySymbol, currentSenderBalance.minus(numericAmount).toNumber());
    recipientWallet.balances.set(
      validatedCurrencySymbol,
      new Decimal(recipientWallet.balances.get(validatedCurrencySymbol) || 0).plus(numericAmount).toNumber()
    );

    // Save updated wallets within the transaction
    await Promise.all([
      senderWallet.save({ session }),
      recipientWallet.save({ session }),
    ]);

    // 6. Record Transactions in a separate Transaction model
    const transactionId = `INT-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    await Transaction.create(
      [
        {
          userId: senderUserId,
          walletId: senderWallet._id,
          type: 'send',
          currency: validatedCurrencySymbol,
          amount: numericAmount.toNumber(),
          transactionId: transactionId,
          counterpartyUserId: recipientUser._id,
          counterpartyIdentifier: recipientIdentifier,
          status: 'COMPLETED',
          notes: `Sent to ${recipientIdentifier}`,
        },
        {
          userId: recipientUser._id,
          walletId: recipientWallet._id,
          type: 'receive',
          currency: validatedCurrencySymbol,
          amount: numericAmount.toNumber(),
          transactionId: transactionId,
          counterpartyUserId: senderUserId,
          counterpartyIdentifier: senderUser.username || senderUser.email,
          status: 'COMPLETED',
          notes: `Received from ${senderUser.username || senderUser.email}`,
        },
      ],
      { session }
    );

    // 7. Commit Transaction
    await session.commitTransaction();
    logger.info(`Internal fund transfer successful: ${transactionId} from ${senderUser.email} to ${recipientUser.email}`);

    // 8. Send Email Notifications
    try {
      await sendEmail({
        to: senderUser.email,
        subject: 'Funds Sent Successfully',
        template: 'fundsSent',
        data: {
          name: senderUser.name,
          amount: numericAmount.toFixed(2),
          currency: validatedCurrencySymbol,
          recipient: recipientIdentifier,
          transactionId: transactionId,
        },
      });

      await sendEmail({
        to: recipientUser.email,
        subject: 'Funds Received',
        template: 'fundsReceived',
        data: {
          name: recipientUser.name,
          amount: numericAmount.toFixed(2),
          currency: validatedCurrencySymbol,
          sender: senderUser.username || senderUser.email,
          transactionId: transactionId,
        },
      });
    } catch (emailError) {
      logger.error(`Error sending internal fund transfer emails: ${emailError.message}`);
    }

    // 9. Send Success Response
    res.status(200).json(
      formatResponse(true, 'Funds sent successfully to recipient.', {
        transactionId: transactionId,
        senderNewBalance: senderWallet.balances.get(validatedCurrencySymbol).toFixed(8),
        currency: validatedCurrencySymbol,
        recipient: recipientIdentifier,
      })
    );
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Internal fund transfer failed for user ${req.user._id}: ${error.message}`, error);

    if (res.headersSent) {
      return;
    }

    res.status(400).json(formatResponse(false, error.message || 'An unexpected error occurred during internal fund transfer.'));
  } finally {
    session.endSession();
  }
};
