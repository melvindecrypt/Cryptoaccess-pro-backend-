const User = require('../models/User');
const { formatResponse } = require('../utils/helpers');
const logger = require('../utils/logger');
const { validateProPlusPayment } = require('../validators/subscriptionValidators');

// Admin endpoints
exports.confirmPaymentForProPlus = async (req, res) => {
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
      paymentEvidence: user.subscription.paymentEvidence
    };

    // Add to history
    user.subscriptionHistory.push({
      startDate: user.subscription.subscribedAt,
      endDate: user.subscription.expiresAt,
      verifiedBy: req.user._id,
      paymentEvidence: user.subscription.paymentEvidence
    });

    await user.save({ session });
    await session.commitTransaction();

    logger.info(`Pro+ payment confirmed by admin`, {
      adminId: req.user._id,
      userId: user._id,
      transactionId
    });

    res.json(formatResponse(true, 'Pro+ subscription activated', {
      user: user._id,
      expiresAt: user.subscription.expiresAt
    }));

  } catch (error) {
    await session.abortTransaction();
    logger.error(`Payment confirmation failed: ${error.message}`);
    res.status(500).json(formatResponse(false, 'Payment confirmation failed'));
  } finally {
    session.endSession();
  }
};

// User endpoints
exports.notifyPaymentForProPlus = async (req, res) => {
  const session = await User.startSession();
  session.startTransaction();

  try {
    const { transactionId, screenshotUrl } = req.body;
    
    // Validate input
    if (!transactionId || !screenshotUrl) {
      return res.status(400).json(formatResponse(false, 'Transaction ID and proof required'));
    }

    const user = await User.findById(req.user._id).session(session);
    
    // Check existing status
    if (user.subscription.isProPlus) {
      return res.status(409).json(formatResponse(false, 'Pro+ subscription already active'));
    }

    // Store payment evidence
    user.subscription.paymentStatus = 'pending';
    user.subscription.paymentEvidence = {
      transactionId,
      screenshot: screenshotUrl,
      timestamp: new Date()
    };

    await user.save({ session });
    await session.commitTransaction();

    logger.info(`Payment notification received`, {
      userId: user._id,
      transactionId
    });

    res.json(formatResponse(true, 'Payment details submitted for review', {
      nextSteps: 'Admin will review within 24 hours',
      contact: 'support@yourdomain.com'
    }));

  } catch (error) {
    await session.abortTransaction();
    logger.error(`Payment notification failed: ${error.message}`);
    res.status(500).json(formatResponse(false, 'Payment notification failed'));
  } finally {
    session.endSession();
  }
};

// Admin endpoints
exports.getPendingPayments = async (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json(formatResponse(false, 'Admin access required'));
    }

    const pendingUsers = await User.find({
      'subscription.paymentStatus': 'pending'
    }).select('email subscription.paymentEvidence');

    res.json(formatResponse(true, 'Pending payments retrieved', pendingUsers));
  } catch (error) {
    logger.error(`Pending payments fetch failed: ${error.message}`);
    res.status(500).json(formatResponse(false, 'Failed to retrieve pending payments'));
  }
};

// In controllers/subscriptionController.js

exports.getProPlusPlan = async (req, res) => {
  try {
    const proPlusPlanDetails = {
      name: 'Pro+',
      price: 19.99, // Example
      currency: 'USD',
      features: ['Advanced charting tools', 'Higher trading limits', 'Dedicated support'], // Example
    };

    res.json(formatResponse(true, 'Pro+ plan details retrieved successfully', proPlusPlanDetails));

  } catch (error) {
    console.error('Error fetching Pro+ plan details:', error);
    res.status(500).json(formatResponse(false, 'Server error fetching Pro+ plan details', { error: error.message }));
  }
};

// In controllers/subscriptionController.js

exports.upgradeProPlus = async (req, res) => {
  try {
    // Logic to process the Pro+ upgrade payment
    const paymentSuccessful = await processProPlusPayment(req.user._id, req.body); // Placeholder

    if (paymentSuccessful) {
      await User.findByIdAndUpdate(req.user._id, { proPlusStatus: true });
      res.json(formatResponse(true, 'Successfully upgraded to Pro+'));
    } else {
      res.status(402).json(formatResponse(false, 'Pro+ upgrade payment failed'));
    }

  } catch (error) {
    console.error('Error upgrading to Pro+:', error);
    res.status(500).json(formatResponse(false, 'Server error during Pro+ upgrade', { error: error.message }));
  }
};

// Placeholder for the actual payment processing logic
async function processProPlusPayment(userId, paymentDetails) {
  // Implement your payment gateway integration here
  return true; // Example: Replace with actual payment processing outcome
}
