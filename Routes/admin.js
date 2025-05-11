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

// Add to grant-pro-plus:
   if (user.subscription.isProPlus) {
     return res.status(400).json(formatResponse(false, 'User already has Pro+'));
   }

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

// In admin.js KYC approval handler
await notificationService.create(
  user._id,
  'kyc',
  'KYC Approved',
  'Your identity verification has been approved',
  { kycStatus: 'approved' }
);

await notificationService.sendEmailNotification(
  user.email,
  'KYC Approved',
  'kycApproved',
  { name: user.firstName }
);

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
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const User = require('../../models/User');
const AdminAction = require('../../models/AuditLog); // Optional: for admin audit logs
const authMiddleware = require('../../middleware/adminAuth');

// Send unlimited virtual funds to any user
router.post('/send-funds', authMiddleware, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { recipientEmail, currency, amount } = req.body;

    // Input validation
    if (!recipientEmail || !currency || typeof amount !== 'number' || amount <= 0) {
      await session.abortTransaction();
      return res.status(400).json(formatResponse(false, 'Valid recipientEmail, currency, and positive amount are required.'));
    }

    // Get supported virtual currencies dynamically from the schema
    const SUPPORTED_CURRENCIES = Object.keys(User.schema.path('virtualBalances').schema.paths);
    if (!SUPPORTED_CURRENCIES.includes(currency)) {
      await session.abortTransaction();
      return res.status(400).json(formatResponse(false, `Unsupported currency. Valid options: ${SUPPORTED_CURRENCIES.join(', ')}`));
    }

    // Find user
    const user = await User.findOne({ email: recipientEmail }).session(session);
    if (!user) {
      await session.abortTransaction();
      return res.status(404).json(formatResponse(false, 'Recipient user not found.'));
    }

    // Credit funds
    user.virtualBalances[currency] += amount;

    // Log the transaction
    user.transactions.push({
      type: 'admin-credit',
      currency,
      amount,
      timestamp: new Date(),
      adminId: req.user.userId
    });

    await user.save({ session });

    // Optional: store in admin audit log
    await AdminAction.create([{
      adminId: req.user.userId,
      action: 'send-funds',
      targetUser: user._id,
      details: { currency, amount },
      timestamp: new Date()
    }], { session });

    await session.commitTransaction();
    session.endSession();

    return res.json(formatResponse(true, 'Funds sent successfully.', {
      recipientEmail: user.email,
      currency,
      newBalance: user.virtualBalances[currency],
      transactionCount: user.transactions.length
    }));

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Admin send-funds error:', error);
    return res.status(500).json(formatResponse(false, 'Failed to send funds. Try again.'));
  }
});

module.exports = router;
  // Add this to routes/admin.js (after other routes)
router.get('/users', authenticate, isAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, isProPlus } = req.query;
    const filter = {};

    // Add filters
    if (status) filter.kycStatus = status; // e.g., 'pending', 'approved'
    if (isProPlus) filter['subscription.isProPlus'] = isProPlus === 'true';

    const users = await User.find(filter)
      .select('-password -__v -verificationToken')
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    res.json(formatResponse(true, 'Users fetched', { users }));
  } catch (err) {
    logger.error(`Admin user list error: ${err.message}`);
    res.status(500).json(formatResponse(false, 'Failed to fetch users'));
  }
});

  router.patch('/verify-email', authenticate, isAdmin, async (req, res) => {
  try {
    const { email, verify = true } = req.body;
    const user = await User.findOneAndUpdate(
      { email },
      { isVerified: verify },
      { new: true }
    ).select('email isVerified');

    if (!user) {
      return res.status(404).json(formatResponse(false, 'User not found'));
    }

    logger.info(`Admin ${req.user.email} ${verify ? 'verified' : 'unverified'} ${email}`);
    res.json(formatResponse(true, `Email ${verify ? 'verified' : 'unverified'}`));
  } catch (err) {
    logger.error(`Email verification error: ${err.message}`);
    res.status(500).json(formatResponse(false, 'Failed to update verification'));
  }
});

router.delete('/users/:id', authenticate, isAdmin, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Validate the target user
    const targetUser = await User.findById(req.params.id)
      .session(session)
      .select('email isAdmin');
    
    if (!targetUser) {
      await session.abortTransaction();
      return res.status(404).json(formatResponse(false, 'User not found'));
    }

    // 2. Prevent self-deletion and admin deletion
    if (targetUser._id.equals(req.user._id)) {
      await session.abortTransaction();
      return res.status(403).json(formatResponse(false, 'Cannot delete yourself'));
    }

    if (targetUser.isAdmin) {
      await session.abortTransaction();
      return res.status(403).json(formatResponse(false, 'Cannot delete other admins'));
    }

    // 3. Archive user data (including related records)
    const archiveData = {
      user: targetUser.toObject(),
      deletedBy: req.user._id,
      deletedAt: new Date(),
      reason: req.body.reason || 'No reason provided'
    };

    await ArchiveUser.create([archiveData], { session });

    // 4. Cascade delete related data
    await Promise.all([
      Wallet.deleteMany({ userId: targetUser._id }).session(session),
      Transaction.deleteMany({ userId: targetUser._id }).session(session),
      // Add other models as needed (Investments, etc.)
    ]);

    // 5. Delete the user
    await User.deleteOne({ _id: targetUser._id }).session(session);

    // 6. Commit the transaction
    await session.commitTransaction();

    // 7. Log and respond
    logger.warn(`ADMIN ACTION: User deleted`, {
      admin: req.user.email,
      target: targetUser.email,
      ip: req.ip
    });

    res.json(formatResponse(true, 'User and all associated data deleted permanently', {
      userId: targetUser._id,
      archived: true
    }));

  } catch (err) {
    await session.abortTransaction();
    logger.error(`USER DELETION FAILED: ${err.message}`, {
      stack: err.stack,
      admin: req.user?.email,
      targetId: req.params.id
    });
    res.status(500).json(formatResponse(false, 'Deletion failed. Please try again.'));
  } finally {
    session.endSession();
  }
});

// File: routes/admin.js
router.patch('/adjust-balance', authenticate, isAdmin, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { userId, currency, amount, reason } = req.body;
    const numericAmount = new Decimal(amount);

    // Validate input
    if (!/^[A-Z]{3,5}$/.test(currency)) {
      return res.status(400).json(formatResponse(false, 'Invalid currency format'));
    }

    const user = await User.findById(userId).session(session);
    if (!user) throw new Error('User not found');

    // Initialize to 0 if currency doesn't exist
    const currentBalance = new Decimal(user.virtualBalances[currency] || 0);
    const newBalance = currentBalance.plus(numericAmount);

    // Update balance
    user.virtualBalances[currency] = newBalance.toNumber();
    
    // Audit log
    user.transactions.push({
      type: 'admin_adjustment',
      currency,
      amount: numericAmount.toNumber(),
      admin: req.user._id,
      reason: reason || 'No reason provided',
      timestamp: new Date()
    });

    await user.save({ session });
    await session.commitTransaction();

    res.json(formatResponse(true, 'Balance updated', {
      currency,
      newBalance: user.virtualBalances[currency]
    }));

  } catch (error) {
    await session.abortTransaction();
    res.status(400).json(formatResponse(false, error.message));
  } finally {
    session.endSession();
  }
});

const payoutService = require('../services/payoutService');

// Manual trigger
router.post('/process-payouts', authenticate, isAdmin, async (req, res) => {
  try {
    await payoutService.processROIPayouts();
    res.json(formatResponse(true, 'ROI payouts processed'));
  } catch (error) {
    res.status(500).json(formatResponse(false, error.message));
  }
});

// File: routes/admin.js
router.get('/user-wallet/:userId', authenticate, isAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId)
      .select('virtualBalances transactions email');
    
    if (!user) {
      return res.status(404).json(formatResponse(false, 'User not found'));
    }

    res.json(formatResponse(true, 'Wallet retrieved', {
      email: user.email,
      balances: user.virtualBalances,
      transactions: user.transactions
    }));
  } catch (error) {
    res.status(500).json(formatResponse(false, error.message));
  }
});

// routes/admin.js
router.get('/kyc-docs/:userId', authenticate, isAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId)
      .select('kycDocuments kycStatus email');

    if (!user) {
      return res.status(404).json(formatResponse(false, 'User not found'));
    }

    res.json(formatResponse(true, 'KYC documents retrieved', {
      email: user.email,
      kycStatus: user.kycStatus,
      documents: user.kycDocuments.map(doc => ({
        docType: doc.docType,
        fileUrl: `/api/admin/kyc-preview?path=${encodeURIComponent(doc.fileUrl)}`,
        status: doc.status,
        uploadedAt: doc.uploadedAt
      }))
    }));

  } catch (error) {
    logger.error(`KYC docs access error: ${error.message}`);
    res.status(500).json(formatResponse(false, 'Failed to retrieve documents'));
  }
});

// routes/admin.js
const secureLocalAccess = require('../middlewares/localStorageAccess');

router.get('/kyc-preview', authenticate, isAdmin, secureLocalAccess, (req, res) => {
  res.sendFile(req.localFilePath);
});


// File: routes/admin.js
router.get('/withdrawals/pending', authenticate, isAdmin, async (req, res) => {
  try {
    const withdrawals = await Withdrawal.find({ status: 'pending' })
      .populate('user', 'email')
      .sort({ createdAt: -1 });

    res.json(formatResponse(true, 'Pending withdrawals', withdrawals));
  } catch (error) {
    res.status(500).json(formatResponse(false, error.message));
  }
});

router.patch('/withdrawals/:id', authenticate, isAdmin, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { action, transactionHash, adminNotes } = req.body;
    const withdrawal = await Withdrawal.findById(req.params.id).session(session);

    if (!withdrawal) throw new Error('Withdrawal not found');

    // Process action
    switch (action) {
      case 'approve':
        withdrawal.status = 'approved';
        withdrawal.adminNotes = adminNotes;
        break;

      case 'reject':
        withdrawal.status = 'rejected';
        withdrawal.adminNotes = adminNotes;
        
        // Refund user
        await User.findByIdAndUpdate(
          withdrawal.user,
          { $inc: { [`virtualBalances.${withdrawal.currency}`]: withdrawal.amount } },
          { session }
        );
        break;

      case 'complete':
        withdrawal.status = 'processed';
        withdrawal.processedAt = new Date();
        withdrawal.transactionHash = transactionHash;
        break;

      default:
        throw new Error('Invalid action');
    }

    await withdrawal.save({ session });
    await session.commitTransaction();

    res.json(formatResponse(true, `Withdrawal ${action}d`, withdrawal));

  } catch (error) {
    await session.abortTransaction();
    res.status(400).json(formatResponse(false, error.message));
  } finally {
    session.endSession();
  }
});

// routes/admin.js
router.patch('/users/:id',
  authenticate,
  isAdmin,
  auditLog('admin_action', {
    entityType: 'User',
    entityId: req => req.params.id,
    metadata: req => ({ action: 'user_update' })
  }),
  adminController.updateUser
);

const mongoose = require('mongoose');
const User = require('../models/User');
const ArchiveUser = require('../models/ArchiveUser'); // New model
const logger = require('../utils/logger');

/**
 * @route DELETE /api/admin/users/:id
 * @desc Permanently delete a user account (admin only)
 * @access Private/Admin
 */
router.delete('/users/:id', authenticate, isAdmin, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Find user to delete
    const user = await User.findById(req.params.id).session(session);
    if (!user) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // 2. Prevent self-deletion
    if (user._id.equals(req.user._id)) {
      await session.abortTransaction();
      return res.status(403).json({
        success: false,
        message: 'Cannot delete your own account'
      });
    }

    // 3. Archive user data first
    await ArchiveUser.create([{
      originalId: user._id,
      email: user.email,
      deletedBy: req.user._id,
      deletionReason: req.body.reason || 'No reason provided',
      userData: user.toObject()
    }], { session });

    // 4. Perform deletion
    await User.deleteOne({ _id: user._id }).session(session);

    // 5. Commit transaction
    await session.commitTransaction();

    logger.warn(`User ${user.email} deleted by admin ${req.user.email}`, {
      adminId: req.user._id,
      userId: user._id
    });

    res.json({
      success: true,
      message: 'User permanently deleted'
    });

  } catch (error) {
    await session.abortTransaction();
    logger.error(`User deletion failed: ${error.message}`, {
      adminId: req.user._id,
      error: error.message
    });
    res.status(500).json({
      success: false,
      message: 'Deletion failed'
    });
  } finally {
    session.endSession();
  }
});