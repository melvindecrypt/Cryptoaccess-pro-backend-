const { formatResponse } = require('../utils/helpers');
const logger = require('../utils/logger');
const User = require('../models/user');
const Wallet = require('../models/wallet');
const Currency = require('../models/currency');
const Decimal = require('decimal.js');

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

exports.sendFunds = async (req, res) => {
  const session = await Wallet.startSession();
  session.startTransaction();

  try {
    const { currency, amount, recipientAddress } = req.body;
    const userId = req.user._id;
    const numericAmount = new Decimal(amount);

    // Validate input
    await validateCurrency(currency);
    if (!recipientAddress) {
      throw new Error('Recipient address is required');
    }
    if (numericAmount.lessThanOrEqualTo(0)) {
      throw new Error('Amount must be positive');
    }

    const wallet = await Wallet.findOne({ userId }).session(session);
    if (!wallet) {
      throw new Error('Wallet not found');
    }

    const currentBalance = new Decimal(wallet.balances.get(currency) || 0);
    if (currentBalance.lessThan(numericAmount)) {
      throw new Error(`Insufficient ${currency} balance`);
    }

    // Simulate sending funds
    wallet.balances.set(currency, currentBalance.minus(numericAmount).toNumber());
    wallet.transactions.push({
      type: 'send',
      currency,
      amount: numericAmount.toNumber(),
      recipientAddress,
      status: 'PENDING',
      timestamp: new Date(),
    });

    await wallet.save({ session });
    await session.commitTransaction();

    res.json(formatResponse(true, 'Send request initiated', {}));

  } catch (error) {
    await session.abortTransaction();
    logger.error(`Send funds error: ${error.message}`);
    res.status(400).json(formatResponse(false, error.message));
  } finally {
    session.endSession();
  }
};

exports.sendFunds = async (req, res) => {
  const session = await Wallet.startSession();
  session.startTransaction();

  try {
    const { currency, amount, recipientIdentifier } = req.body; // Changed recipientAddress to recipientIdentifier
    const senderUserId = req.user._id;
    const numericAmount = new Decimal(amount);

    await validateCurrency(currency);
    if (!recipientIdentifier) {
      throw new Error('Recipient identifier is required');
    }
    if (numericAmount.lessThanOrEqualTo(0)) {
      throw new Error('Amount must be positive');
    }

    const senderWallet = await Wallet.findOne({ userId: senderUserId }).session(session);
    if (!senderWallet) {
      throw new Error('Sender wallet not found');
    }

    const currentSenderBalance = new Decimal(senderWallet.balances.get(currency) || 0);
    if (currentSenderBalance.lessThan(numericAmount)) {
      throw new Error(`Insufficient ${currency} balance`);
    }

    // Identify the recipient user and their wallet (you'll need to define how you identify users)
    const recipientUser = await User.findOne({ $or: [{ username: recipientIdentifier }, { email: recipientIdentifier }] }).session(session); // Example: find by username or email
    if (!recipientUser || recipientUser._id.equals(senderUserId)) {
      throw new Error('Recipient not found or cannot send to yourself');
    }

    const recipientWallet = await Wallet.findOne({ userId: recipientUser._id }).session(session);
    if (!recipientWallet) {
      throw new Error('Recipient wallet not found');
    }

    // Update sender's balance
    senderWallet.balances.set(currency, currentSenderBalance.minus(numericAmount).toNumber());
    await senderWallet.save({ session });

    // Update recipient's balance
    const currentRecipientBalance = new Decimal(recipientWallet.balances.get(currency) || 0);
    recipientWallet.balances.set(currency, currentRecipientBalance.plus(numericAmount).toNumber());
    await recipientWallet.save({ session });

    // Record transactions for both sender and receiver
    await Transaction.create({
      userId: senderUserId,
      walletId: senderWallet._id,
      type: 'send',
      currency,
      amount: numericAmount.toNumber(),
      recipientUserId: recipientUser._id,
      recipientIdentifier,
      status: 'COMPLETED',
      timestamp: new Date()
    }, { session });

    await Transaction.create({
      userId: recipientUser._id,
      walletId: recipientWallet._id,
      type: 'receive',
      currency,
      amount: numericAmount.toNumber(),
      senderUserId,
      senderIdentifier: senderUser.username || senderUser.email, // Example
      status: 'COMPLETED',
      timestamp: new Date()
    }, { session });

    await session.commitTransaction();
    res.json(formatResponse(true, 'Funds sent successfully'));

  } catch (error) {
    await session.abortTransaction();
    logger.error(`Send funds error: ${error.message}`);
    res.status(400).json(formatResponse(false, error.message));
  } finally {
    session.endSession();
  }
};
