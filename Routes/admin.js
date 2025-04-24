const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const adminAuth = require('../middleware/adminAuth');
const logger = require('../utils/logger');
const { formatResponse } = require('../utils/helpers');

// --------------------
// Rate Limit for Admin Login
// --------------------
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: formatResponse(false, 'Too many login attempts, try again later')
});

// --------------------
// PUBLIC: Admin Login
// --------------------
router.post('/admin/login', adminLoginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json(formatResponse(false, 'Valid email and password required'));
    }

    const user = await User.findOne({ email }).select('+password');
    if (!user || !user.isAdmin) {
      return res.status(403).json(formatResponse(false, 'Access denied'));
    }

    if (user.isSuspended) {
      return res.status(403).json(formatResponse(false, 'Your account has been suspended by admin'));
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json(formatResponse(false, 'Invalid credentials'));
    }

    const token = jwt.sign({
      userId: user._id,
      email: user.email,
      isAdmin: true,
      permissions: ['admin'],
      authFreshness: Date.now()
    }, process.env.JWT_SECRET, { expiresIn: '15m' });

    logger.info('Admin login successful', { adminId: user._id, ip: req.ip });

    res.cookie('adminToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 900000
    });

    res.json(formatResponse(true, 'Admin login successful', {
      token,
      user: {
        id: user._id,
        email: user.email
      }
    }));
  } catch (err) {
    logger.error('Admin login error', { error: err.message });
    res.status(500).json(formatResponse(false, 'Internal server error'));
  }
});

// --------------------
// PROTECTED ADMIN ROUTES
// --------------------
router.use(adminAuth);

// Admin Helper Handler
const handleAdminAction = async (actionName, res, operation) => {
  try {
    const result = await operation();
    logger.info(`Admin action: ${actionName}`, {
      adminId: res.locals.admin.id,
      target: result.email
    });
    return result;
  } catch (err) {
    logger.error(`Admin action failed: ${actionName}`, {
      adminId: res.locals.admin.id,
      error: err.message
    });
    throw err;
  }
};

// Approve user
router.patch('/approve-user', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json(formatResponse(false, 'Email is required'));

    const user = await handleAdminAction('approve-user', res, async () =>
      User.findOneAndUpdate({ email }, { isApproved: true }, { new: true }).select('-password -__v')
    );

    if (!user) return res.status(404).json(formatResponse(false, 'User not found'));
    res.json(formatResponse(true, 'User approved', user));
  } catch (err) {
    res.status(500).json(formatResponse(false, err.message));
  }
});

// Bypass payment
router.patch('/bypass-payment', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json(formatResponse(false, 'Email is required'));

    const user = await handleAdminAction('bypass-payment', res, async () =>
      User.findOneAndUpdate({ email }, { hasPaid: true }, { new: true }).select('-password -__v')
    );

    if (!user) return res.status(404).json(formatResponse(false, 'User not found'));
    res.json(formatResponse(true, 'Payment bypassed', user));
  } catch (err) {
    res.status(500).json(formatResponse(false, err.message));
  }
});

// Grant Pro+
router.patch('/grant-pro-plus', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json(formatResponse(false, 'Email is required'));

    const user = await handleAdminAction('grant-pro-plus', res, async () =>
      User.findOneAndUpdate({ email }, { isPro: true }, { new: true }).select('-password -__v')
    );

    if (!user) return res.status(404).json(formatResponse(false, 'User not found'));
    res.json(formatResponse(true, 'Pro+ access granted', user));
  } catch (err) {
    res.status(500).json(formatResponse(false, err.message));
  }
});

// Verify KYC
router.patch('/verify-kyc', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json(formatResponse(false, 'Email is required'));

    const user = await handleAdminAction('verify-kyc', res, async () =>
      User.findOneAndUpdate({ email }, { kycStatus: 'approved' }, { new: true }).select('-password -__v')
    );

    if (!user) return res.status(404).json(formatResponse(false, 'User not found'));
    res.json(formatResponse(true, 'KYC verified', user));
  } catch (err) {
    res.status(500).json(formatResponse(false, err.message));
  }
});

// Edit user balance
router.patch('/edit-balance', async (req, res) => {
  try {
    const { email, amount } = req.body;
    if (!email || typeof amount !== 'number') {
      return res.status(400).json(formatResponse(false, 'Email and valid amount required'));
    }

    const user = await handleAdminAction('edit-balance', res, async () =>
      User.findOneAndUpdate({ email }, { $set: { balance: amount } }, { new: true }).select('-password -__v')
    );

    if (!user) return res.status(404).json(formatResponse(false, 'User not found'));
    res.json(formatResponse(true, 'Balance updated', user));
  } catch (err) {
    res.status(500).json(formatResponse(false, err.message));
  }
});

// Suspend or unsuspend user
router.patch('/suspend-user', async (req, res) => {
  try {
    const { email, suspend } = req.body;
    if (!email || typeof suspend !== 'boolean') {
      return res.status(400).json(formatResponse(false, 'Email and suspend status required'));
    }

    const user = await handleAdminAction('suspend-user', res, async () =>
      User.findOneAndUpdate({ email }, { isSuspended: suspend }, { new: true }).select('-password -__v')
    );

    if (!user) return res.status(404).json(formatResponse(false, 'User not found'));
    res.json(formatResponse(true, `User ${suspend ? 'suspended' : 'unsuspended'}`, user));
  } catch (err) {
    res.status(500).json(formatResponse(false, err.message));
  }
});

// --------------------
// Logout
// --------------------
router.post('/logout', (req, res) => {
  res.clearCookie('adminToken');
  logger.info('Admin logout successful', { adminId: res.locals.admin?.id });
  res.json(formatResponse(true, 'Logout successful'));
});

// --------------------
// Global Error Handler
// --------------------
router.use((err, req, res, next) => {
  logger.error(`Admin Route Error: ${err.message}`, {
    path: req.path,
    adminId: res.locals.admin?.id,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
  res.status(500).json(formatResponse(false, 'Internal server error'));
});

module.exports = router;