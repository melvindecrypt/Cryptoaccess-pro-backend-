const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const { authenticate, isAdmin } = require('../middlewares/authMiddleware');
const logger = require('../utils/logger');
const { formatResponse } = require('../utils/helpers');
const AdminController = require('../controllers/adminController');
const auditLog = require('../middlewares/auditLog');
const secureLocalAccess = require('../middlewares/localStorageAccess');

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
router.get('/kyc-docs/:userId', adminController.getKycDocs);

//Get KYC Preview 
router.get('/kyc-preview', secureLocalAccess, adminController.getKycPreview);

// Get pending withdrawals
router.get('/withdrawals/pending', adminController.getPendingWithdrawals);

// Process withdrawals
router.patch('/withdrawals/:id', adminController.processWithdrawal);

// In routes/admin.js (or your chosen route file)
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const { getDashboardData, getProfile, updateSecurity, uploadKycDoc } = require('../controllers/userController');

router.get('/dashboard', authenticate, getDashboardData);
router.get('/users/profile', authenticate, getProfile); // Existing route
router.patch('/users/security', authenticate, updateSecurity); // Existing route
router.post('/users/kyc/upload', authenticate, uploadKycDoc);

const { isAdmin } = require('../middlewares/authMiddleware'); // Assuming you have admin authentication middleware
const kycController = require('../controllers/kycController');

router.patch('/kyc/status', isAdmin, kycController.updateKYCStatus);

module.exports = router;




