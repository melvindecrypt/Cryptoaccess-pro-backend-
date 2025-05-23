const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/user');
const Withdrawal = require('../models/withdrawals');
const ArchiveUser = require('../models/archiveUser');
const Wallet = require('../models/wallet');
const Transaction = require('../models/transaction');
const logger = require('../utils/logger');
const { formatResponse } = require('../utils/helpers');
const payoutService = require('../services/payoutService');
const notificationService = require('../services/notificationService');

// ================== Admin Login ==================

exports.adminLogin = async (req, res) => {
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

    const token = jwt.sign({
      userId: user._id,
      email: user.email,
      isAdmin: true,
      permissions: ['admin'],
      authFreshness: Date.now()
    }, process.env.JWT_SECRET, { expiresIn: '15m' });

    res.cookie('adminToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 900000
    });

    logger.info('Admin login successful', { userId: user._id });

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

async function handleAdminAction(actionName, req, operation)
// Approve user account
exports.approveUser = async (req, res) => {
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
    logger.error('Error approving user:', err); // Enhanced error logging
    res.status(500).json(formatResponse(false, err.message));
  }
};

// Bypass payment requirement 
exports.bypassPayment = async (req, res) => {
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
    logger.error('Error bypassing payment:', err); // Enhanced error logging
    res.status(500).json(formatResponse(false, err.message));
  }
};

// Grant pro+ subscription 
exports.grantProPlus = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json(formatResponse(false, 'Email required'));

    const user = await User.findOne({ email }).select('subscription'); // Check existing Pro+ status efficiently
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
          'subscription.expiresAt': new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        },
        { new: true, session }
      ).select('-password -__v')
    );

    res.json(formatResponse(true, 'Pro+ granted', updatedUser));
  } catch (err) {
    logger.error('Error granting Pro+:', err); // Enhanced error logging
    res.status(500).json(formatResponse(false, err.message));
  }
};

// Verify kyc Documents - Handles Approve/Reject based on original definition
exports.verifyKyc = async (req, res) => {
  try {
    const updatedUser = await handleAdminAction('verify-kyc-action', req, async (session) => {
      const { userId, action, rejectionReason } = req.body;

      const validActions = ['approve', 'reject'];
      if (!userId || !action || !validActions.includes(action) || (action === 'reject' && !rejectionReason)) {
          res.status(400).json(formatResponse(false, 'Invalid input: User ID, valid action ("approve"/"reject"), and rejection reason (if rejecting) are required.'));
          throw new Error('Validation failed: Invalid input for verifyKyc');
      }

      const user = await User.findById(userId).session(session).select('-password -__v -kycDocuments -transactions'); // Exclude sensitive/large fields not needed for response/update determination

      if (!user) {
          res.status(404).json(formatResponse(false, 'User not found.'));
          throw new Error('User not found for KYC verification');
      }

      // Optional: Prevent re-processing if status is already final
      if (user.kycStatus === 'approved' || user.kycStatus === 'rejected') {
          res.status(400).json(formatResponse(false, `User KYC is already ${user.kycStatus}.`));
          throw new Error(`User KYC status is already final: ${user.kycStatus}`);
      }


      let updateFields = {};
      if (action === 'approve') {
        updateFields = {
          kycStatus: 'approved',
          // Note: This sets ALL kycDocuments.$.status to 'verified'. Adjust if specific document status needs updating.
          // You might need a separate endpoint/logic for per-document status updates if necessary.
          'kycDocuments.$[].status': 'verified',
          kycVerifiedBy: req.user.userId,
          kycReviewedAt: new Date(),
          rejectionReason: null
        };

      } else if (action === 'reject') {
         updateFields = {
          kycStatus: 'rejected',
           // Note: This sets ALL kycDocuments.$.status to 'rejected'. Adjust if specific document status needs updating.
          'kycDocuments.$[].status': 'rejected',
          kycRejectedBy: req.user.userId,
          kycReviewedAt: new Date(),
          rejectionReason: rejectionReason
        };
      }

      // Use findByIdAndUpdate with the userId within the session
      const userAfterUpdate = await User.findByIdAndUpdate(
        userId,
        updateFields,
        { new: true, session: session }
      ).select('-password -__v -kycDocuments -transactions'); // Select fields to return in the response


      // Notifications are ideally sent AFTER the transaction commits successfully.
      // The handleAdminAction helper manages the transaction.
      // You would access the necessary data (user email, action, reason) from
      // the `updatedUser` object and `req.body` *after* this handleAdminAction
      // call resolves successfully in the outer try block.
      // For the purpose of this snippet *within* the handleAdminAction operation,
      // we just perform the DB update. Notifications will be called outside this internal function.

      return userAfterUpdate; // Return the updated user document for the outer scope
    });

    // --- Notifications called AFTER successful transaction commit ---
    // Access data needed for notifications from req.body and the result (updatedUser)
    const { action, rejectionReason } = req.body; // Get action/reason from original request
    const userForNotification = updatedUser; // Use the updated user object

    // Determine notification content based on action
    const notificationTitle = action === 'approve' ? 'KYC Approved' : 'KYC Rejected';
    const notificationMessage = action === 'approve' ? 'Your identity verification has been approved.' : `Your identity verification was rejected. Reason: ${rejectionReason}`;
    const emailTemplate = action === 'approve' ? 'kycApproved' : 'kycRejected';


     if (userForNotification) {
         // Ensure notificationService methods exist and work with these arguments
        await notificationService.create( userForNotification._id, 'kyc', notificationTitle, notificationMessage, { kycStatus: userForNotification.kycStatus, rejectionReason: userForNotification.rejectionReason });
        await notificationService.sendEmailNotification( userForNotification.email, notificationTitle, emailTemplate, { name: userForNotification.firstName, reason: rejectionReason }); // Assuming user has firstName for template
     } else {
         logger.error(`Could not retrieve updated user (${updatedUser?._id}) for notifications after successful KYC action (${action})`);
     }
    // --- End Notifications ---


    // Send the final success response
    res.json(formatResponse(true, `User KYC status updated to ${action}`, {
      user: updatedUser // Include the updated user object in the response data
    }));

  } catch (err) {
    // Catch errors thrown by validation, handleAdminAction (which re-throws), or notifications
    logger.error('Error during verifyKyc action:', err.message, { stack: err.stack, body: req.body, adminId: req.user?.userId });

    // Check if a response status has already been sent (e.g., by inner validation throws)
    if (res.headersSent) {
        // If headers were sent (meaning status/response was already set inside), just log and exit
        return;
    }

    // Handle specific error messages thrown by validation/user not found inside handleAdminAction operation
    if (err.message.includes('Validation failed')) {
         // The status (400) and response body should have already been set before the throw inside
         // handleAdminAction's operation. So the check `res.headersSent` above should ideally catch this.
         // If handleAdminAction doesn't set the response on error, you might need more complex parsing here.
         // Assuming handleAdminAction propagates the inner response status/body: nothing more needed here.
         // If handleAdminAction just re-throws simple Errors, then handle 404 specifically:
         if (err.message.includes('User not found')) {
              return res.status(404).json(formatResponse(false, 'User not found.'));
         }
         // Or handle 400 specifically:
         if (err.message.includes('Invalid input')) {
             return res.status(400).json(formatResponse(false, err.message)); // Return 400 with the validation message
         }

    }


    // Default: If error is not a specific validation/404 error handled above, return 500
    res.status(500).json(formatResponse(false, err.message || 'An unexpected error occurred.'));
  }
};

// Update user balance 
exports.updateBalance = async (req, res) => {
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
    logger.error('Error updating balance:', err); // Enhanced error logging
    res.status(500).json(formatResponse(false, err.message));
  }
};

// Suspend/Unsuspend Account 
exports.suspendUser = async (req, res) => {
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
    logger.error('Error suspending/unsuspending user:', err); // Enhanced error logging
    res.status(500).json(formatResponse(false, err.message));
  }
};

// Logout 
exports.logout = (req, res) => {
  res.clearCookie('adminToken');
  logger.info('Admin logout', { userId: req.user.userId });
  res.json(formatResponse(true, 'Session terminated'));
};

// Admin Sends Virtual Funds to a User (/send-funds)

exports.sendFunds = async (req, res) => {
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
      adminId: req.user.userId
    });

    await user.save({ session });

    // Optional: store in admin audit log - Assuming you have an AuditLog model
    if (AuditLog) {
      await AuditLog.create([{
        adminId: req.user.userId,
        action: 'send-funds',
        targetUser: user._id,
        details: { currency, amount },
        timestamp: new Date()
      }], { session });
    }

    await session.commitTransaction();

    return res.json(formatResponse(true, 'Funds sent successfully.', {
      recipientEmail: user.email,
      currency,
      newBalance: user.virtualBalances[currency],
      transactionCount: user.transactions.length
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
exports.getUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, isProPlus } = req.query;
    const filter = {};

    // Add filters
    if (status) filter.kycStatus = status; // e.g., 'pending', 'approved'
    if (isProPlus) filter['subscription.isProPlus'] = isProPlus === 'true';

    // --- Add these lines to get the total count ---
    const totalCount = await User.countDocuments(filter);
    const totalPages = Math.ceil(totalCount / parseInt(limit));
    // ---------------------------------------------

    const users = await User.find(filter)
      .select('-password -__v -verificationToken')
      .skip((page - 1) * parseInt(limit)) // Ensure limit is parsed as integer here too
      .limit(parseInt(limit))
      .lean();

    // --- Modify the response payload ---
    res.json(formatResponse(true, 'Users fetched', {
      users,
      totalCount, // Include total count
      totalPages  // Include total pages
    }));
    // ----------------------------------

  } catch (err) {
    logger.error(`Admin user list error: ${err.message}`);
    res.status(500).json(formatResponse(false, 'Failed to fetch users'));
  }
};

// Verify Email
exports.verifyEmail = async (req, res) => {
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
exports.deleteUser = async (req, res) => {
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

    res.json(formatResponse(true, 'User deleted successfully', {
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
};

//Adjust balance
const Decimal = require('decimal.js'); // Make sure to import this in your controller

exports.adjustBalance = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { userId, currency, amount, reason } = req.body;
    const numericAmount = new Decimal(amount);

    // Validate input
    if (!/^[A-Z]{3,5}$/.test(currency)) {
      await session.abortTransaction();
      return res.status(400).json(formatResponse(false, 'Invalid currency format'));
    }

    const user = await User.findById(userId).session(session);
    if (!user) {
      await session.abortTransaction();
      return res.status(404).json(formatResponse(false, 'User not found'));
    }

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
    logger.error('Error adjusting balance:', error); // Enhanced error logging
    res.status(400).json(formatResponse(false, error.message));
  } finally {
    session.endSession();
  }
};

// Process Payouts
const payoutService = require('../services/payoutService'); // Make sure this is correctly required

exports.processPayouts = async (req, res) => {
  try {
    await payoutService.processROIPayouts();
    res.json(formatResponse(true, 'ROI payouts processed'));
  } catch (error) {
    logger.error('Error processing payouts:', error); // Enhanced error logging
    res.status(500).json(formatResponse(false, error.message));
  }
};

//Update User
exports.updateUser = async (req, res) => {
  // Implement your user update logic here
  // This function will receive the request and response objects
  // and should handle updating the user based on the request body
  // and the user ID from req.params.id.

  try {
    const userId = req.params.id;
    const updateData = req.body;

    // Add your validation and update logic here
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
exports.getUserWallet = async (req, res) => {
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
    logger.error(`Error retrieving user wallet: ${error.message}`);
    res.status(500).json(formatResponse(false, error.message));
  }
};

// Get KYC Documents
exports.getKycDocs = async (req, res) => {
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
};

// Get KYC Preview 
exports.getKycPreview = (req, res) => {
  res.sendFile(req.localFilePath);
};

// Get Pending withdrawals 
exports.getPendingWithdrawals = async (req, res) => {
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
exports.processWithdrawal = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { action, transactionHash, adminNotes } = req.body;
    const withdrawal = await Withdrawal.findById(req.params.id).session(session).populate('user', 'virtualBalances'); // Populate user for balance update

    if (!withdrawal) {
      await session.abortTransaction();
      return res.status(404).json(formatResponse(false, 'Withdrawal not found'));
    }

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
          withdrawal.user._id, // Use _id for update
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

// controllers/adminController.js

const AuditLog = require('../models/auditLog');
const Notification = require('../models/notification');

exports.getAdminWallets = async (req, res) => {
  const wallets = await AdminWallet.findOne({});
  res.json({ success: true, wallets });
};

exports.updateAdminWallets = async (req, res) => {
  await AdminWallet.updateOne({}, req.body, { upsert: true });
  res.json({ success: true, message: 'Wallet addresses updated' });
};

exports.getAuditLogs = async (req, res) => {
  const logs = await AuditLog.find({}).sort({ timestamp: -1 });
  res.json({ success: true, logs });
};

exports.getNotifications = async (req, res) => {
  const notifications = await Notification.find({}).sort({ createdAt: -1 });
  res.json({ success: true, notifications });
};

exports.notificationService = async (req, res) => {
  const { title, message, target, userId } = req.body;
  if (target === 'all') {
    // Logic to send to all users...
  } else if (target === 'specific' && userId) {
    await notificationService(userId, title, message);
  }
  res.json({ success: true, message: 'Notification sent' });
};

exports.getSettings = async (req, res) => {
  const settings = await Settings.findOne({});
  res.json({ success: true, settings });
};

exports.updateSettings = async (req, res) => {
  await Settings.updateOne({}, req.body, { upsert: true });
  res.json({ success: true, message: 'Settings updated' });
};


