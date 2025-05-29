import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import User from '../models/user.js';
import Withdrawal from '../models/withdrawals.js';
import ArchiveUser from '../models/archiveUser.js';
import Wallet from '../models/wallet.js';
import Transaction from '../models/transaction.js';
import AuditLog from '../models/auditLog.js';
import Notification from '../models/notification.js';
import logger from '../utils/logger.js';
import { formatResponse } from '../utils/helpers.js';
import payoutService from '../services/payoutService.js';
import notificationService from '../services/notificationService.js';
import Decimal from 'decimal.js';

// ================== Admin Login ==================
export const adminLogin = async (req, res) => {
  const { email, password } = req.body;
  try {
    if (!email || !password || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json(formatResponse(false, 'Valid email and password required'));
    }
    const user = await User.findOne({ email })
      .select('+password +isAdmin +isSuspended')
      .lean();
    if (!user?.isAdmin) {
      logger.warn('Admin login attempt failed: Incorrect email or password', { email });
      return res.status(403).json(formatResponse(false, 'Access denied'));
    }
    if (user.isSuspended) {
      logger.warn('Suspended admin login attempt', { userId: user._id });
      return res.status(403).json(formatResponse(false, 'Account suspended'));
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      logger.warn('Admin login failed: Password mismatch', { email });
      return res.status(401).json(formatResponse(false, 'Invalid credentials'));
    }
    const token = jwt.sign(
      {
        userId: user._id,
        email: user.email,
        isAdmin: true,
        permissions: ['admin'],
        authFreshness: Date.now(),
      },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );
    res.cookie('adminToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 900000,
    });
    logger.info('Admin login successful', { userId: user._id });
    res.json(
      formatResponse(true, 'Authentication successful', {
        user: {
          id: user._id,
          email: user.email,
          lastLogin: user.lastLogin,
        },
      })
    );
  } catch (err) {
    logger.error('Admin login error', { error: err.stack });
    res.status(500).json(formatResponse(false, 'Internal server error'));
  }
};

// ================== Admin Actions Handler ==================
const handleAdminAction = async (actionName, req, operation) => {
  const session = await User.startSession();
  session.startTransaction();
  try {
    const result = await operation(session);
    await session.commitTransaction();
    logger.info(`Admin action: ${actionName}`, {
      adminId: req.user.userId,
      target: result.email,
    });
    return result;
  } catch (err) {
    await session.abortTransaction();
    logger.error(`Admin action failed: ${actionName}`, {
      adminId: req.user.userId,
      error: err.message,
      stack: err.stack,
    });
    throw err;
  } finally {
    session.endSession();
  }
};

// ================== User Management Endpoints ==================
// Approve user account
export const approveUser = async (req, res) => {
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
    logger.error('Error approving user:', err);
    res.status(500).json(formatResponse(false, err.message));
  }
};

// Bypass payment requirement
export const bypassPayment = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json(formatResponse(false, 'Email required'));
    const user = await handleAdminAction('bypass-payment', req, async (session) =>
      User.findOneAndUpdate(
        { email },
        {
          hasPaid: true,
          $push: { paymentHistory: { adminOverride: req.user.userId } },
        },
        { new: true, session }
      ).select('-password -__v')
    );
    if (!user) return res.status(404).json(formatResponse(false, 'User not found'));
    res.json(formatResponse(true, 'Payment bypassed', user));
  } catch (err) {
    logger.error('Error bypassing payment:', err);
    res.status(500).json(formatResponse(false, err.message));
  }
};

// Grant Pro+ subscription
export const grantProPlus = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json(formatResponse(false, 'Email required'));
    const user = await User.findOne({ email }).select('subscription');
    if (!user) {
      return res.status(404).json(formatResponse(false, 'User not found'));
    }
    if (user.subscription?.isProPlus) {
      return res.status(400).json(formatResponse(false, 'User already has Pro+'));
    }
    const updatedUser = await handleAdminAction('grant-pro-plus', req, async (session) =>
      User.findOneAndUpdate(
        { email },
        {
          'subscription.isProPlus': true,
          'subscription.subscribedAt': new Date(),
          'subscription.expiresAt': new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
        { new: true, session }
      ).select('-password -__v')
    );
    res.json(formatResponse(true, 'Pro+ granted', updatedUser));
  } catch (err) {
    logger.error('Error granting Pro+:', err);
    res.status(500).json(formatResponse(false, err.message));
  }
};

// Verify KYC Documents
export const verifyKyc = async (req, res) => {
  try {
    const updatedUser = await handleAdminAction('verify-kyc-action', req, async (session) => {
      const { userId, action, rejectionReason } = req.body;
      const validActions = ['approve', 'reject'];
      if (!userId || !action || !validActions.includes(action) || (action === 'reject' && !rejectionReason)) {
        res.status(400).json(formatResponse(false, 'Invalid input: User ID, valid action ("approve"/"reject"), and rejection reason (if rejecting) are required.'));
        throw new Error('Validation failed: Invalid input for verifyKyc');
      }
      const user = await User.findById(userId).session(session).select('-password -__v -kycDocuments -transactions');
      if (!user) {
        res.status(404).json(formatResponse(false, 'User not found.'));
        throw new Error('User not found for KYC verification');
      }
      if (user.kycStatus === 'approved' || user.kycStatus === 'rejected') {
        res.status(400).json(formatResponse(false, `User KYC is already ${user.kycStatus}.`));
        throw new Error(`User KYC status is already final: ${user.kycStatus}`);
      }
      let updateFields = {};
      if (action === 'approve') {
        updateFields = {
          kycStatus: 'approved',
          'kycDocuments.$[].status': 'verified',
          kycVerifiedBy: req.user.userId,
          kycReviewedAt: new Date(),
          rejectionReason: null,
        };
      } else if (action === 'reject') {
        updateFields = {
          kycStatus: 'rejected',
          'kycDocuments.$[].status': 'rejected',
          kycRejectedBy: req.user.userId,
          kycReviewedAt: new Date(),
          rejectionReason: rejectionReason,
        };
      }
      const userAfterUpdate = await User.findByIdAndUpdate(userId, updateFields, { new: true, session }).select('-password -__v -kycDocuments -transactions');
      return userAfterUpdate;
    });

    const { action, rejectionReason } = req.body;
    const userForNotification = updatedUser;
    const notificationTitle = action === 'approve' ? 'KYC Approved' : 'KYC Rejected';
    const notificationMessage = action === 'approve' ? 'Your identity verification has been approved.' : `Your identity verification was rejected. Reason: ${rejectionReason}`;
    const emailTemplate = action === 'approve' ? 'kycApproved' : 'kycRejected';

    if (userForNotification) {
      await notificationService.create(userForNotification._id, 'kyc', notificationTitle, notificationMessage, {
        kycStatus: userForNotification.kycStatus,
        rejectionReason: userForNotification.rejectionReason,
      });
      await notificationService.sendEmailNotification(userForNotification.email, notificationTitle, emailTemplate, {
        name: userForNotification.firstName,
        reason: rejectionReason,
      });
    } else {
      logger.error(`Could not retrieve updated user (${updatedUser?._id}) for notifications after successful KYC action (${action})`);
    }

    res.json(formatResponse(true, `User KYC status updated to ${action}`, { user: updatedUser }));
  } catch (err) {
    logger.error('Error during verifyKyc action:', err.message, { stack: err.stack, body: req.body, adminId: req.user?.userId });
    if (res.headersSent) {
      return;
    }
    if (err.message.includes('Validation failed')) {
      if (err.message.includes('User not found')) {
        return res.status(404).json(formatResponse(false, 'User not found.'));
      }
      if (err.message.includes('Invalid input')) {
        return res.status(400).json(formatResponse(false, err.message));
      }
    }
    res.status(500).json(formatResponse(false, err.message || 'An unexpected error occurred.'));
  }
};

// Update user balance
export const updateBalance = async (req, res) => {
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
    res.json(formatResponse(true, 'Balance updated', { currency, newBalance: user.virtualBalances[currency] }));
  } catch (err) {
    logger.error('Error updating balance:', err);
    res.status(500).json(formatResponse(false, err.message));
  }
};

// Suspend/Unsuspend Account
export const suspendUser = async (req, res) => {
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
          $push: {
            suspensionHistory: {
              date: new Date(),
              admin: req.user.userId,
              reason,
            },
          },
        },
        { new: true, session }
      ).select('-password -__v')
    );
    if (!user) return res.status(404).json(formatResponse(false, 'User not found'));
    res.json(formatResponse(true, `User ${suspend ? 'suspended' : 'unsuspended'}`, user));
  } catch (err) {
    logger.error('Error suspending/unsuspending user:', err);
    res.status(500).json(formatResponse(false, err.message));
  }
};

// Logout
export const logout = (req, res) => {
  res.clearCookie('adminToken');
  logger.info('Admin logout', { userId: req.user.userId });
  res.json(formatResponse(true, 'Session terminated'));
};

// Admin Sends Virtual Funds to a User (/send-funds)
export const sendFunds = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { recipientEmail, currency, amount } = req.body;
    if (!recipientEmail || !currency || typeof amount !== 'number' || amount <= 0) {
      await session.abortTransaction();
      return res.status(400).json(formatResponse(false, 'Valid recipientEmail, currency, and positive amount are required.'));
    }
    const SUPPORTED_CURRENCIES = Object.keys(User.schema.path('virtualBalances').schema.paths);
    if (!SUPPORTED_CURRENCIES.includes(currency)) {
      await session.abortTransaction();
      return res.status(400).json(formatResponse(false, `Unsupported currency. Valid options: ${SUPPORTED_CURRENCIES.join(', ')}`));
    }
    const user = await User.findOne({ email: recipientEmail }).session(session);
    if (!user) {
      await session.abortTransaction();
      return res.status(404).json(formatResponse(false, 'Recipient user not found.'));
    }
    user.virtualBalances[currency] = (user.virtualBalances[currency] || 0) + amount;
    user.transactions.push({
      type: 'admin-credit',
      currency,
      amount,
      timestamp: new Date(),
      adminId: req.user.userId,
    });
    await user.save({ session });
    if (AuditLog) {
      await AuditLog.create(
        [
          {
            adminId: req.user.userId,
            action: 'send-funds',
            targetUser: user._id,
            details: { currency, amount },
            timestamp: new Date(),
          },
        ],
        { session }
      );
    }
    await session.commitTransaction();
    return res.json(formatResponse(true, 'Funds sent successfully.', {
      recipientEmail: user.email,
      currency,
      newBalance: user.virtualBalances[currency],
      transactionCount: user.transactions.length,
    }));
  } catch (error) {
    await session.abortTransaction();
    logger.error('Admin send-funds error:', error);
    return res.status(500).json(formatResponse(false, 'Failed to send funds. Try again.'));
  } finally {
    session.endSession();
  }
};

// Get Users
export const getUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, isProPlus } = req.query;
    const filter = {};
    if (status) filter.kycStatus = status;
    if (isProPlus) filter['subscription.isProPlus'] = isProPlus === 'true';
    const totalCount = await User.countDocuments(filter);
    const totalPages = Math.ceil(totalCount / parseInt(limit));
    const users = await User.find(filter)
      .select('-password -__v -verificationToken')
      .skip((page - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .lean();
    res.json(formatResponse(true, 'Users fetched', { users, totalCount, totalPages }));
  } catch (err) {
    logger.error(`Admin user list error: ${err.message}`);
    res.status(500).json(formatResponse(false, 'Failed to fetch users'));
  }
};

// Verify Email
export const verifyEmail = async (req, res) => {
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
};

// Delete User
export const deleteUser = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const targetUser = await User.findById(req.params.id).session(session).select('email isAdmin');
    if (!targetUser) {
      await session.abortTransaction();
      return res.status(404).json(formatResponse(false, 'User not found'));
    }
    if (targetUser._id.equals(req.user._id)) {
      await session.abortTransaction();
      return res.status(403).json(formatResponse(false, 'Cannot delete yourself'));
    }
    if (targetUser.isAdmin) {
      await session.abortTransaction();
      return res.status(403).json(formatResponse(false, 'Cannot delete other admins'));
    }
    const archiveData = {
      user: targetUser.toObject(),
      deletedBy: req.user._id,
      deletedAt: new Date(),
      reason: req.body.reason || 'No reason provided',
    };
    await ArchiveUser.create([archiveData], { session });
    await Promise.all([
      Wallet.deleteMany({ userId: targetUser._id }).session(session),
      Transaction.deleteMany({ userId: targetUser._id }).session(session),
    ]);
    await User.deleteOne({ _id: targetUser._id }).session(session);
    await session.commitTransaction();
    logger.warn(`ADMIN ACTION: User deleted`, {
      admin: req.user.email,
      target: targetUser.email,
      ip: req.ip,
    });
    res.json(formatResponse(true, 'User deleted successfully', { userId: targetUser._id, archived: true }));
  } catch (err) {
    await session.abortTransaction();
    logger.error(`USER DELETION FAILED: ${err.message}`, {
      stack: err.stack,
      admin: req.user?.email,
      targetId: req.params.id,
    });
    res.status(500).json(formatResponse(false, 'Deletion failed. Please try again.'));
  } finally {
    session.endSession();
  }
};

// Adjust Balance
export const adjustBalance = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { userId, currency, amount, reason } = req.body;
    const numericAmount = new Decimal(amount);
    if (!/^[A-Z]{3,5}$/.test(currency)) {
      await session.abortTransaction();
      return res.status(400).json(formatResponse(false, 'Invalid currency format'));
    }
    const user = await User.findById(userId).session(session);
    if (!user) {
      await session.abortTransaction();
      return res.status(404).json(formatResponse(false, 'User not found'));
    }
    const currentBalance = new Decimal(user.virtualBalances[currency] || 0);
    const newBalance = currentBalance.plus(numericAmount);
    user.virtualBalances[currency] = newBalance.toNumber();
    user.transactions.push({
      type: 'admin_adjustment',
      currency,
      amount: numericAmount.toNumber(),
      admin: req.user._id,
      reason: reason || 'No reason provided',
      timestamp: new Date(),
    });
    await user.save({ session });
    await session.commitTransaction();
    res.json(formatResponse(true, 'Balance updated', { currency, newBalance: user.virtualBalances[currency] }));
  } catch (error) {
    await session.abortTransaction();
    logger.error('Error adjusting balance:', error);
    res.status(400).json(formatResponse(false, error.message));
  } finally {
    session.endSession();
  }
};

// Process Payouts
export const processPayouts = async (req, res) => {
  try {
    await payoutService.processROIPayouts();
    res.json(formatResponse(true, 'ROI payouts processed'));
  } catch (error) {
    logger.error('Error processing payouts:', error);
    res.status(500).json(formatResponse(false, error.message));
  }
};

// Update User
export const updateUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const updateData = req.body;
    const updatedUser = await User.findByIdAndUpdate(userId, updateData, { new: true }).select('-password -__v');
    if (!updatedUser) {
      return res.status(404).json(formatResponse(false, 'User not found'));
    }
    res.json(formatResponse(true, 'User updated', updatedUser));
  } catch (error) {
    logger.error(`Error updating user ${req.params.id}:`, error);
    res.status(500).json(formatResponse(false, 'Failed to update user'));
  }
};

// Get User Wallet
export const getUserWallet = async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select('virtualBalances transactions email');
    if (!user) {
      return res.status(404).json(formatResponse(false, 'User not found'));
    }
    res.json(formatResponse(true, 'Wallet retrieved', { email: user.email, balances: user.virtualBalances, transactions: user.transactions }));
  } catch (error) {
    logger.error(`Error retrieving user wallet: ${error.message}`);
    res.status(500).json(formatResponse(false, error.message));
  }
};

// Get KYC Documents
export const getKycDocs = async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select('kycDocuments kycStatus email');
    if (!user) {
      return res.status(404).json(formatResponse(false, 'User not found'));
    }
    res.json(formatResponse(true, 'KYC documents retrieved', {
      email: user.email,
      kycStatus: user.kycStatus,
      documents: user.kycDocuments.map((doc) => ({
        docType: doc.docType,
        fileUrl: `/api/admin/kyc-preview/${req.params.userId}?path=${encodeURIComponent(doc.fileUrl)}`,
        status: doc.status,
        uploadedAt: doc.uploadedAt,
      })),
    }));
  } catch (error) {
    logger.error(`KYC docs access error: ${error.message}`);
    res.status(500).json(formatResponse(false, 'Failed to retrieve documents'));
  }
};

// Get KYC Preview
export const getKycPreview = (req, res) => {
  res.sendFile(req.localFilePath);
};

// Get Pending Withdrawals
export const getPendingWithdrawals = async (req, res) => {
  try {
    const withdrawals = await Withdrawal.find({ status: 'pending' })
      .populate('user', 'email')
      .sort({ createdAt: -1 });
    res.json(formatResponse(true, 'Pending withdrawals', withdrawals));
  } catch (error) {
    logger.error(`Error fetching pending withdrawals: ${error.message}`);
    res.status(500).json(formatResponse(false, error.message));
  }
};

// Process Withdrawals
export const processWithdrawal = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { action, transactionHash, adminNotes } = req.body;
    const withdrawal = await Withdrawal.findById(req.params.id).session(session).populate('user', 'virtualBalances');
    if (!withdrawal) {
      await session.abortTransaction();
      return res.status(404).json(formatResponse(false, 'Withdrawal not found'));
    }
    switch (action) {
      case 'approve':
        withdrawal.status = 'approved';
        withdrawal.adminNotes = adminNotes;
        break;
      case 'reject':
        withdrawal.status = 'rejected';
        withdrawal.adminNotes = adminNotes;
        await User.findByIdAndUpdate(
          withdrawal.user._id,
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
        await session.abortTransaction();
        return res.status(400).json(formatResponse(false, 'Invalid action'));
    }
    await withdrawal.save({ session });
    await session.commitTransaction();
    res.json(formatResponse(true, `Withdrawal ${action}d`, withdrawal));
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error processing withdrawal: ${error.message}`);
    res.status(400).json(formatResponse(false, error.message));
  } finally {
    session.endSession();
  }
};

// Get Admin Wallets
export const getAdminWallets = async (req, res) => {
  const wallets = await AdminWallet.findOne({});
  res.json({ success: true, wallets });
};

export const updateAdminWallets = async (req, res) => {
  await AdminWallet.updateOne({}, req.body, { upsert: true });
  res.json({ success: true, message: 'Wallet addresses updated' });
};

export const getAuditLogs = async (req, res) => {
  try {
    const { page = 1, limit = 50, userId, action } = req.query;

    if (userId && !userId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ status: false, message: 'Invalid userId format' });
    }

    const filter = {};
    if (userId) filter.userId = userId;
    if (action) filter.action = action;

    const logs = await AuditLog.find(filter)
      .populate('userId', 'email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit, 10));

    res.json({
      status: true,
      data: logs,
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to retrieve audit logs.',
      error: error.message
    });
  }
};

export const getNotifications = async (req, res) => {
  const notifications = await Notification.find({}).sort({ createdAt: -1 });
  res.json({ success: true, notifications });
};

export const adminNotificationService = async (req, res) => {
  const { title, message, target, userId } = req.body;
  if (target === 'all') {
    // Implement logic to send to all users here.
  } else if (target === 'specific' && userId) {
    await notificationService.create(userId, 'admin_direct', title, message);
  }
  res.json({ success: true, message: 'Notification sent' });
};

export const getSettings = async (req, res) => {
  const settings = await Settings.findOne({});
  res.json({ success: true, settings });
};

export const updateSettings = async (req, res) => {
  await Settings.updateOne({}, req.body, { upsert: true });
  res.json({ success: true, message: 'Settings updated' });
};