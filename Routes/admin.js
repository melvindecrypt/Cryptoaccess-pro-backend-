const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { authenticate, isAdmin } = require('../middlewares/authMiddleware');
const logger = require('../utils/logger');
const { formatResponse } = require('../utils/helpers');
const adminController = require('../controllers/adminController');
const auditLog = require('../middlewares/auditLog');
const secureLocalAccess = require('../middlewares/localStorageAccess');
const { adminLogin } = require('../controllers/adminController');

// ================== Rate Limiting ==================
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: formatResponse(false, 'Too many login attempts, try again later'),
  skipSuccessfulRequests: true
});

// ================== Admin Login Route ==================
router.post('/login', adminLoginLimiter, adminLogin);
    
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

// Error Handling 
router.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  logger.error(`Admin route error: ${err.message}`, {
    path: req.path,
    userId: req.user?.userId,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
  res.status(statusCode).json(formatResponse(false, err.message));
});

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
router.patch('/users/:id',
  adminController.updateUser
);

// Get User Wallet
router.get('/user-wallet/:userId', adminController.getUserWallet);

// Get KYC Documents 
router.get('/kyc-docs/:userId',isAdmin, adminController.getKycDocs);

//Get KYC Preview 
router.get('/kyc-preview/userId', isAdmin, secureLocalAccess, adminController.getKycPreview);

// Get pending withdrawals
router.get('/withdrawals/pending', adminController.getPendingWithdrawals);

// Process withdrawals
router.patch('/withdrawals/:id', adminController.processWithdrawal);

module.exports = router;