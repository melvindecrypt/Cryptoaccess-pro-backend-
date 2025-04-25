const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const { authenticate, isAdmin } = require('../middlewares/authMiddleware');
const logger = require('../utils/logger');
const { formatResponse } = require('../utils/helpers');

// ================== Rate Limiting ==================
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: formatResponse(false, 'Too many login attempts, try again later'),
  skipSuccessfulRequests: true
});

// ================== Admin Login ==================
router.post('/login', adminLoginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input format
    if (!email || !password || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json(formatResponse(false, 'Valid email and password required'));
    }

    // Find admin user with password
    const user = await User.findOne({ email })
      .select('+password +isAdmin +isSuspended')
      .lean();

    // Security checks
    if (!user?.isAdmin) {
      logger.warn('Admin login attempt failed: Invalid credentials', { email });
      return res.status(403).json(formatResponse(false, 'Access denied'));
    }

    if (user.isSuspended) {
      logger.warn('Suspended admin login attempt', { userId: user._id });
      return res.status(403).json(formatResponse(false, 'Account suspended'));
    }

    // Password verification
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      logger.warn('Admin login failed: Password mismatch', { email });
      return res.status(401).json(formatResponse(false, 'Invalid credentials'));
    }

    // JWT Token generation
    const token = jwt.sign({
      userId: user._id,
      email: user.email,
      isAdmin: true,
      permissions: ['admin'],
      authFreshness: Date.now()
    }, process.env.JWT_SECRET, { expiresIn: '15m' });

    // Secure cookie settings
    res.cookie('adminToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 900000 // 15 minutes
    });

    logger.info('Admin login successful', { userId: user._id });

    // Response without sensitive data
    res.json(formatResponse(true, 'Authentication successful', {
      user: {
        id: user._id,
        email: user.email,
        lastLogin: user.lastLogin
      }
    }));

  } catch (err) {
    logger.error('Admin login error', { error: err.stack });
    res.status(500).json(formatResponse(false, 'Internal server error'));
  }
});

// ================== Protected Routes ==================
router.use(authenticate);
router.use(isAdmin);

// ================== Admin Actions Handler ==================
const handleAdminAction = async (actionName, req, operation) => {
  const session = await User.startSession();
  session.startTransaction();
  
  try {
    const result = await operation(session);
    await session.commitTransaction();
    
    logger.info(`Admin action: ${actionName}`, {
      adminId: req.user.userId,
      target: result.email
    });

    return result;
  } catch (err) {
    await session.abortTransaction();
    logger.error(`Admin action failed: ${actionName}`, {
      adminId: req.user.userId,
      error: err.message,
      stack: err.stack
    });
    throw err;
  } finally {
    session.endSession();
  }
};

// ================== User Management Endpoints ==================

// Approve user account
router.patch('/approve-user', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json(formatResponse(false, 'Email required'));

    const user = await handleAdminAction('approve-user', req, async (session) => 
      User.findOneAndUpdate(
        { email },
        { isApproved: true, approvedBy: req.user.userId },
        { new: true, session }
      ).select('-password -__v')
    );

    if (!user) return res.status(404).json(formatResponse(false, 'User not found'));
    res.json(formatResponse(true, 'User approved', user));
  } catch (err) {
    res.status(500).json(formatResponse(false, err.message));
  }
});

// Bypass payment requirement
router.patch('/bypass-payment', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json(formatResponse(false, 'Email required'));

    const user = await handleAdminAction('bypass-payment', req, async (session) => 
      User.findOneAndUpdate(
        { email },
        { 
          hasPaid: true,
          $push: { paymentHistory: { adminOverride: req.user.userId } }
        },
        { new: true, session }
      ).select('-password -__v')
    );

    if (!user) return res.status(404).json(formatResponse(false, 'User not found'));
    res.json(formatResponse(true, 'Payment bypassed', user));
  } catch (err) {
    res.status(500).json(formatResponse(false, err.message));
  }
});

// Grant Pro+ subscription
router.patch('/grant-pro-plus', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json(formatResponse(false, 'Email required'));

    const user = await handleAdminAction('grant-pro-plus', req, async (session) => 
      User.findOneAndUpdate(
        { email },
        { 
          'subscription.isProPlus': true,
          'subscription.subscribedAt': new Date(),
          'subscription.expiresAt': new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        },
        { new: true, session }
      ).select('-password -__v')
    );

    if (!user) return res.status(404).json(formatResponse(false, 'User not found'));
    res.json(formatResponse(true, 'Pro+ granted', user));
  } catch (err) {
    res.status(500).json(formatResponse(false, err.message));
  }
});

// Verify KYC documents
router.patch('/verify-kyc', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json(formatResponse(false, 'Email required'));

    const user = await handleAdminAction('verify-kyc', req, async (session) => 
      User.findOneAndUpdate(
        { email },
        { 
          kycStatus: 'approved',
          'kycDocuments.$[].status': 'verified',
          kycVerifiedBy: req.user.userId
        },
        { new: true, session }
      ).select('-password -__v')
    );

    if (!user) return res.status(404).json(formatResponse(false, 'User not found'));
    res.json(formatResponse(true, 'KYC verified', user));
  } catch (err) {
    res.status(500).json(formatResponse(false, err.message));
  }
});

// Update user balance (using new virtualBalances structure)
router.patch('/update-balance', async (req, res) => {
  try {
    const { email, currency, amount } = req.body;
    if (!email || !currency || typeof amount !== 'number') {
      return res.status(400).json(formatResponse(false, 'Invalid parameters'));
    }

    const user = await handleAdminAction('update-balance', req, async (session) => 
      User.findOneAndUpdate(
        { email },
        { $set: { [`virtualBalances.${currency}`]: amount } },
        { new: true, session }
      ).select('-password -__v')
    );

    if (!user) return res.status(404).json(formatResponse(false, 'User not found'));
    res.json(formatResponse(true, 'Balance updated', {
      currency,
      newBalance: user.virtualBalances[currency]
    }));
  } catch (err) {
    res.status(500).json(formatResponse(false, err.message));
  }
});

// Suspend/Unsuspend account
router.patch('/suspend-user', async (req, res) => {
  try {
    const { email, reason, suspend = true } = req.body;
    if (!email || typeof suspend !== 'boolean') {
      return res.status(400).json(formatResponse(false, 'Invalid parameters'));
    }

    const user = await handleAdminAction('suspend-user', req, async (session) => 
      User.findOneAndUpdate(
        { email },
        { 
          isSuspended: suspend,
          $push: { suspensionHistory: { 
            date: new Date(), 
            admin: req.user.userId, 
            reason 
          }}
        },
        { new: true, session }
      ).select('-password -__v')
    );

    if (!user) return res.status(404).json(formatResponse(false, 'User not found'));
    res.json(formatResponse(true, `User ${suspend ? 'suspended' : 'unsuspended'}`, user));
  } catch (err) {
    res.status(500).json(formatResponse(false, err.message));
  }
});

// ================== Session Management ==================
router.post('/logout', (req, res) => {
  res.clearCookie('adminToken');
  logger.info('Admin logout', { userId: req.user.userId });
  res.json(formatResponse(true, 'Session terminated'));
});

// ================== Error Handling ==================
router.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  logger.error(`Admin route error: ${err.message}`, {
    path: req.path,
    userId: req.user?.userId,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
  res.status(statusCode).json(formatResponse(false, err.message));
});

module.exports = router;

// Admin sends virtual funds to a user
router.post('/send-funds', async (req, res) => {
  try {
    const { recipientEmail, currency, amount } = req.body;
    if (!recipientEmail || !currency || typeof amount !== 'number') {
      return res.status(400).json(formatResponse(false, 'Invalid parameters'));
    }

    // Ensure the recipient exists
    const user = await User.findOne({ email: recipientEmail });
    if (!user) {
      return res.status(404).json(formatResponse(false, 'User not found'));
    }

// Add to your admin.js routes (after auth middleware)
router.post('/send-funds', async (req, res) => {
  try {
    const { recipientEmail, currency, amount } = req.body;
    
    // Validate input
    if (!recipientEmail || !currency || typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json(formatResponse(false, 
        'Valid recipient email, currency, and positive amount required'
      ));
    }

    // Get supported currencies from User model
    const SUPPORTED_CURRENCIES = Object.keys(User.schema.path('virtualBalances').schema.paths);
    if (!SUPPORTED_CURRENCIES.includes(currency)) {
      return res.status(400).json(formatResponse(false, 
        `Unsupported currency. Valid options: ${SUPPORTED_CURRENCIES.join(', ')}`
      ));
    }

    const result = await handleAdminAction('send-funds', req, async (session) => {
      // Transactional update
      const user = await User.findOneAndUpdate(
        { email: recipientEmail },
        { $inc: { [`virtualBalances.${currency}`]: amount } },
        { new: true, session }
      );

      if (!user) throw new Error('Recipient not found');
      
      // Log transaction
      user.transactions.push({
        type: 'admin-credit',
        currency,
        amount,
        adminId: req.user.userId,
        timestamp: new Date()
      });

      await user.save({ session });
      return user;
    });

    res.json(formatResponse(true, 'Funds transferred successfully', {
      recipient: result.email,
      newBalance: result.virtualBalances[currency],
      currency
    }));

  } catch (err) {
    res.status(err.statusCode || 500).json(formatResponse(false, err.message));
  }
});