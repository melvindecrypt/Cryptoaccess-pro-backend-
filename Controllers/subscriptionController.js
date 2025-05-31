import User from '../models/user.js';
import { formatResponse } from '../utils/helpers.js';
import logger from '../utils/logger.js';
import { validateProPlusPayment } from '../validators/subscriptionValidators.js';

// Define your wallet addresses here (or fetch from config/walletAddresses)
const proPlusPaymentDetails = {
  price: 299.99,
  currency: 'USD',
  wallets: {
    BTC: 'bc1qrhmqgnwml62udh5c5wnyukx65rdtqdsa58p54l',
    ETH: '0xEe19FeE35ef7257c5Bcd8a1206dB6b1fCdf8e767',
    SOL: 'ChbMRwr4xbH9hQSJA5Ei5MmRWAjn5MPUsVpNUMabsf5K',
    BNB: '0xEe19FeE35ef7257c5Bcd8a1206dB6b1fCdf8e767',
    USDT_ERC20: '0xEe19FeE35ef7257c5Bcd8a1206dB6b1fCdf8e767',
    USDC_ERC20: '0xEe19FeE35ef7257c5Bcd8a1206dB6b1fCdf8e767',
    DAI: '0xEe19FeE35ef7257c5Bcd8a1206dB6b1fCdf8e767',
    XRP: 'rGcSBHz3dURpsh3Tg4y2qpbMMpMaxTMQL7',
    DOGE: 'DJWWvsfk7cZLFjeWhb9KDyustcZ4vVu7ik',
    TRX: 'TJ3JRojmo9USXSZ7Sindzycz15EHph3ZYP',
    USDT_TRC20: 'TJ3JRojmo9USXSZ7Sindzycz15EHph3ZYP',
    LTC: 'ltc1qp36qqd669xnvtmehyst3ht9suu8z73qasgnxps',
    MNT: '0xEe19FeE35ef7257c5Bcd8a1206dB6b1fCdf8e767',
  },
  features: [
    'Advanced charting tools',
    'Unlimited account balance',
    'LNF',
    'Faster execution speed of up to 15ms',
    'Higher trading limits',
    'Access to our top-end Trading Bots',
    'Secure transactions with wallet tracking',
    'Dedicated support',
  ],
  paymentInstructions:
    'Please send a one-time payment of $299.99 (or equivalent in your chosen cryptocurrency) to one of the wallets below. After making the payment, upload your proof of payment (transaction ID and/or screenshot) to notify for review.',
};

// Admin endpoints
export const confirmPaymentForProPlus = async (req, res) => {
  const session = await User.startSession();
  session.startTransaction();

  try {
    const { userId, transactionId } = req.body;

    // Validate admin privileges
    if (!req.user.isAdmin) {
      return res.status(403).json(formatResponse(false, 'Admin privileges required'));
    }

    // Validate input
    const { error } = validateProPlusPayment(req.body);
    if (error) return res.status(400).json(formatResponse(false, error.details[0].message));

    const user = await User.findById(userId).session(session);

    // Check user existence
    if (!user) {
      await session.abortTransaction();
      return res.status(404).json(formatResponse(false, 'User not found'));
    }

    // Check payment status
    if (user.subscription.paymentStatus === 'verified') {
      await session.abortTransaction();
      return res.status(409).json(formatResponse(false, 'Payment already verified'));
    }

    // Update subscription
    user.subscription = {
      isProPlus: true,
      subscribedAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      paymentStatus: 'verified',
      paymentEvidence: user.subscription.paymentEvidence,
    };

    // Add to history
    user.subscriptionHistory.push({
      startDate: user.subscription.subscribedAt,
      endDate: user.subscription.expiresAt,
      verifiedBy: req.user._id,
      paymentEvidence: user.subscription.paymentEvidence,
    });

    await user.save({ session });
    await session.commitTransaction();

    logger.info(`Pro+ payment confirmed`, {
      adminId: req.user._id,
      userId: user._id,
      transactionId,
    });

    res.json(
      formatResponse(true, 'Pro+ subscription activated', {
        user: user._id,
        expiresAt: user.subscription.expiresAt,
      })
    );
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Payment confirmation failed: ${error.message}`);
    res.status(500).json(formatResponse(false, 'Payment confirmation failed'));
  } finally {
    session.endSession();
  }
};

// Admin endpoints
export const getPendingPayments = async (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json(formatResponse(false, 'Admin access required'));
    }

    const pendingUsers = await User.find({
      'subscription.paymentStatus': 'pending',
    }).select('email subscription.paymentEvidence');

    res.json(formatResponse(true, 'Pending payments retrieved', pendingUsers));
  } catch (error) {
    logger.error(`Pending payments fetch failed: ${error.message}`);
    res.status(500).json(formatResponse(false, 'Failed to retrieve pending payments'));
  }
};

// In controllers/subscriptionController.js
export const getProPlusPlan = async (req, res) => {
  try {
    const proPlusPlanDetailsToSend = {
      name: 'Pro+',
      price: proPlusPaymentDetails.price,
      currency: proPlusPaymentDetails.currency,
      features: proPlusPaymentDetails.features,
      paymentWallets: proPlusPaymentDetails.wallets,
      paymentInstructions: proPlusPaymentDetails.paymentInstructions,
    };

    res.json(formatResponse(true, 'Pro+ plan details retrieved successfully', proPlusPlanDetailsToSend));
  } catch (error) {
    console.error('Error fetching Pro+ plan details:', error);
    res.status(500).json(formatResponse(false, 'Server error fetching Pro+ plan details', { error: error.message }));
  }
};