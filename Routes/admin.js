import express from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, isAdmin } from '../middlewares/authMiddleware.js';
import logger from '../utils/logger.js';
import { formatResponse } from '../utils/helpers.js';
import adminController from '../controllers/adminController.js';
import auditLog from '../middlewares/auditLog.js';
import secureLocalAccess from '../middlewares/localStorageAccess.js';

const router = express.Router();

// ================== Rate Limiting ==================
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Max 5 attempts per windowMs
  message: formatResponse(false, 'Too many login attempts, try again later'),
  skipSuccessfulRequests: true,
});

// ================== Admin Login Route ==================
router.post('/login', adminLoginLimiter, adminController.adminLogin);

// ================== Protected Routes ==================
router.use(authenticate);
router.use(isAdmin);

// ================== User Management Endpoints ==================
router.patch('/approve-user', adminController.approveUser);
router.patch('/bypass-access-fee', adminController.bypassPayment);
router.patch('/grant-pro-plus', adminController.grantProPlus);
router.patch('/verify-kyc', adminController.verifyKyc);
router.patch('/update-balance', adminController.updateBalance);
router.patch('/suspend-user', adminController.suspendUser);

// ================== Session Management ==================
router.post('/logout', adminController.logout);

// Admin Sends Virtual Funds to a User (/send-funds)
router.post('/send-funds', adminController.sendFunds);

// Get Users
router.get('/users', adminController.getUsers);

// Verify Email
router.patch('/verify-email', adminController.verifyEmail);

// Delete User
router.delete('/users/:id', adminController.deleteUser);

// Adjust Balance
router.patch('/adjust-balance', adminController.adjustBalance);

// Process Payouts
router.post('/process-payouts', adminController.processPayouts);

// Update User
router.patch('/users/:id', adminController.updateUser);

// Get User Wallet
router.get('/user-wallet/:userId', adminController.getUserWallet);

// Get KYC Documents
router.get('/kyc-docs/:userId', isAdmin, adminController.getKycDocs);

// Get KYC Preview
router.get('/kyc-preview/:userId', isAdmin, secureLocalAccess, adminController.getKycPreview);

// Get Pending Withdrawals
router.get('/withdrawals/pending', adminController.getPendingWithdrawals);

// Process Withdrawals
router.patch('/withdrawals/:id', adminController.processWithdrawal);

// Error Handling Middleware
router.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  logger.error(`Admin route error: ${err.message}`, {
    path: req.path,
    userId: req.user?.userId,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
  res.status(statusCode).json(formatResponse(false, err.message));
});

export default router;