// __tests__/controllers/adminController.test.js - Part 1
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Mock external dependencies
jest.mock('../../models/User');
jest.mock('../../models/Withdrawals');
jest.mock('../../models/ArchiveUser');
jest.mock('../../models/Wallet');
jest.mock('../../models/Transaction');
jest.mock('../../models/AuditLog'); // Mock AuditLog for sendFunds
jest.mock('../../models/Notification'); // Mock Notification for verifyKyc
jest.mock('../../models/AdminWallet'); // Mock for admin wallet functions
jest.mock('../../models/Settings'); // Mock for settings functions
jest.mock('../../utils/logger');
jest.mock('../../services/payoutService');
jest.mock('../../services/notificationService');
jest.mock('bcryptjs'); // Mock bcrypt directly for login
jest.mock('jsonwebtoken'); // Mock jsonwebtoken directly for login

const User = require('../../models/User');
const AuditLog = require('../../models/AuditLog'); // Required for sendFunds
const notificationService = require('../../services/notificationService'); // Required for verifyKyc
const adminController = require('../../controllers/adminController');
const { formatResponse } = require('../../utils/helpers'); // Assuming this helper is consistently used

let mongoServer;
let app;

// Mock the internal handleAdminAction helper
// Since handleAdminAction is defined within the same file and not exported for direct testing,
// we'll primarily test the public functions that *use* it.
// However, to simulate its behavior for testing the error paths or successful paths cleanly,
// we'll need to control the `session` and `logger.info/error` calls it makes.
// For the purpose of these tests, we'll let the actual `handleAdminAction` logic run
// and ensure its interactions with `User.startSession` and `logger` are correct.
// We'll mock `User.startSession` to control the session behavior.

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  const express = require('express');
  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true })); // For parsing x-www-form-urlencoded

  // Middleware to attach a mock user (admin) to req.user for protected routes
  app.use((req, res, next) => {
    // For adminLogin, req.user will be null, which is fine.
    // For other routes, assume an authenticated admin user.
    if (!req.path.includes('/admin/login')) {
      req.user = { _id: 'adminUserId123', email: 'admin@example.com', isAdmin: true, userId: 'adminUserId123' };
    }
    next();
  });


  // Define mock routes
  // The original extract had the login function's body but not the function signature.
  // Assuming it's part of an exported `login` or `adminLogin` function.
  // Let's create a mock route for it.
  app.post('/api/admin/login', async (req, res) => {
    const { email, password } = req.body;
    // The provided snippet for adminLogin doesn't have an outer function wrapper.
    // Assuming it's wrapped in a function like this for export:
    try {
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

  app.post('/api/admin/users/:id/approve', adminController.approveUser); // Using a placeholder for approveUser
  app.post('/api/admin/users/bypass-payment', adminController.bypassPayment);
  app.post('/api/admin/users/grant-proplus', adminController.grantProPlus);
  app.post('/api/admin/kyc/verify', adminController.verifyKyc); // Corrected endpoint as per common practice
  app.put('/api/admin/users/balance', adminController.updateBalance); // Placeholder route
  app.put('/api/admin/users/suspend', adminController.suspendUser); // Placeholder route
  app.post('/api/admin/logout', adminController.logout); // Placeholder route
  app.post('/api/admin/send-funds', adminController.sendFunds); // Placeholder route
  app.get('/api/admin/users', adminController.getUsers); // Placeholder route
  app.put('/api/admin/users/verify-email', adminController.verifyEmail); // Placeholder route
  app.delete('/api/admin/users/:id', adminController.deleteUser); // Placeholder route
  app.post('/api/admin/adjust-balance', adminController.adjustBalance); // Placeholder route
  app.post('/api/admin/process-payouts', adminController.processPayouts); // Placeholder route
  app.put('/api/admin/users/:id', adminController.updateUser); // Placeholder route
  app.get('/api/admin/users/:userId/wallet', adminController.getUserWallet); // Placeholder route
  app.get('/api/admin/users/:userId/kyc-docs', adminController.getKycDocs); // Placeholder route
  // Note: getKycPreview needs `localStorageAccess.js` middleware which isn't part of this controller.
  // We'll skip testing `getKycPreview` via Supertest if it strictly depends on a middleware to set req.localFilePath.
  // Otherwise, we'd mock that middleware or test the controller function directly.

  app.get('/api/admin/withdrawals/pending', adminController.getPendingWithdrawals); // Placeholder route
  app.post('/api/admin/withdrawals/:id/process', adminController.processWithdrawal); // Placeholder route
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
  jest.clearAllMocks();
});

// Mock session and transaction methods
const mockSession = {
  startTransaction: jest.fn(),
  commitTransaction: jest.fn(),
  abortTransaction: jest.fn(),
  endSession: jest.fn(),
};

describe('AdminController - Core Functions (Part 1)', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    // Default mock for User.startSession
    User.startSession.mockResolvedValue(mockSession);
    // Ensure that all session methods return 'this' for chaining
    mockSession.startTransaction.mockReturnThis();
    mockSession.commitTransaction.mockReturnThis();
    mockSession.abortTransaction.mockReturnThis();
    mockSession.endSession.mockReturnThis();

    // Reset specific mocks that might be set in previous tests
    User.findOne.mockReset();
    User.findOneAndUpdate.mockReset();
    User.findById.mockReset();
    User.findByIdAndUpdate.mockReset();
    bcrypt.compare.mockReset();
    jwt.sign.mockReset();
    logger.info.mockReset();
    logger.warn.mockReset();
    logger.error.mockReset();
    notificationService.create.mockReset();
    notificationService.sendEmailNotification.mockReset();

    process.env.JWT_SECRET = 'test_jwt_secret'; // Set a mock JWT secret for testing
  });

  // Test for the raw adminLogin logic
  describe('Admin Login', () => {
    it('should successfully log in an admin and set cookie', async () => {
      const mockAdmin = {
        _id: 'admin1',
        email: 'admin@example.com',
        password: 'hashedpassword',
        isAdmin: true,
        isSuspended: false,
        lastLogin: new Date(),
      };
      User.findOne.mockResolvedValue(mockAdmin);
      bcrypt.compare.mockResolvedValue(true);
      jwt.sign.mockReturnValue('mockAdminToken');

      const res = await request(app)
        .post('/api/admin/login')
        .send({ email: 'admin@example.com', password: 'password123' });

      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('success');
      expect(res.body.message).toEqual('Authentication successful');
      expect(res.headers['set-cookie'][0]).toContain('adminToken=mockAdminToken');
      expect(User.findOne).toHaveBeenCalledWith({ email: 'admin@example.com' });
      expect(bcrypt.compare).toHaveBeenCalledWith('password123', 'hashedpassword');
      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'admin1', isAdmin: true }),
        process.env.JWT_SECRET,
        expect.any(Object)
      );
      expect(logger.info).toHaveBeenCalledWith('Admin login successful', { userId: 'admin1' });
    });

    it('should return 400 for invalid email or missing password', async () => {
      const res = await request(app)
        .post('/api/admin/login')
        .send({ email: 'invalid-email', password: 'password123' });

      expect(res.statusCode).toEqual(400);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('Valid email and password required');
    });

    it('should return 403 if user is not an admin', async () => {
      User.findOne.mockResolvedValue({
        _id: 'user1',
        email: 'user@example.com',
        password: 'hashedpassword',
        isAdmin: false,
        isSuspended: false,
      });
      bcrypt.compare.mockResolvedValue(true);

      const res = await request(app)
        .post('/api/admin/login')
        .send({ email: 'user@example.com', password: 'password123' });

      expect(res.statusCode).toEqual(403);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('Access denied');
      expect(logger.warn).toHaveBeenCalledWith('Admin login attempt failed: Invalid credentials', { email: 'user@example.com' });
    });

    it('should return 403 if admin account is suspended', async () => {
      User.findOne.mockResolvedValue({
        _id: 'admin1',
        email: 'admin@example.com',
        password: 'hashedpassword',
        isAdmin: true,
        isSuspended: true,
      });
      bcrypt.compare.mockResolvedValue(true);

      const res = await request(app)
        .post('/api/admin/login')
        .send({ email: 'admin@example.com', password: 'password123' });

      expect(res.statusCode).toEqual(403);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('Account suspended');
      expect(logger.warn).toHaveBeenCalledWith('Suspended admin login attempt', { userId: 'admin1' });
    });

    it('should return 401 for incorrect password', async () => {
      User.findOne.mockResolvedValue({
        _id: 'admin1',
        email: 'admin@example.com',
        password: 'hashedpassword',
        isAdmin: true,
        isSuspended: false,
      });
      bcrypt.compare.mockResolvedValue(false);

      const res = await request(app)
        .post('/api/admin/login')
        .send({ email: 'admin@example.com', password: 'wrongpassword' });

      expect(res.statusCode).toEqual(401);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('Invalid credentials');
      expect(logger.warn).toHaveBeenCalledWith('Admin login failed: Password mismatch', { email: 'admin@example.com' });
    });

    it('should return 500 for server errors during login', async () => {
      User.findOne.mockImplementation(() => {
        throw new Error('DB connection failed');
      });

      const res = await request(app)
        .post('/api/admin/login')
        .send({ email: 'admin@example.com', password: 'password123' });

      expect(res.statusCode).toEqual(500);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('Internal server error');
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Admin login error'), expect.any(Object));
    });
  });

  describe('approveUser', () => {
    it('should approve a user successfully', async () => {
      const mockUser = {
        _id: 'user1',
        email: 'user@example.com',
        isApproved: false,
        approvedBy: null,
        select: jest.fn().mockReturnThis(),
      };
      User.findOneAndUpdate.mockResolvedValue({ ...mockUser, isApproved: true, approvedBy: 'adminUserId123' });
      User.startSession.mockResolvedValue(mockSession);

      const res = await request(app)
        .post('/api/admin/users/user1/approve') // Using :id in route
        .send({ email: 'user@example.com' });

      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('success');
      expect(res.body.message).toEqual('User approved');
      expect(res.body.data.isApproved).toBe(true);
      expect(User.findOneAndUpdate).toHaveBeenCalledWith(
        { email: 'user@example.com' },
        { isApproved: true, approvedBy: 'adminUserId123' },
        { new: true, session: mockSession }
      );
      expect(mockSession.commitTransaction).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        'Admin action: approve-user',
        expect.objectContaining({ adminId: 'adminUserId123', target: 'user@example.com' })
      );
    });

    it('should return 400 if email is missing', async () => {
      const res = await request(app)
        .post('/api/admin/users/user1/approve')
        .send({});

      expect(res.statusCode).toEqual(400);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('Email required');
      expect(User.findOneAndUpdate).not.toHaveBeenCalled();
      expect(mockSession.startTransaction).not.toHaveBeenCalled(); // No transaction for bad input
    });

    it('should return 404 if user not found', async () => {
      User.findOneAndUpdate.mockResolvedValue(null);
      User.startSession.mockResolvedValue(mockSession);

      const res = await request(app)
        .post('/api/admin/users/user1/approve')
        .send({ email: 'nonexistent@example.com' });

      expect(res.statusCode).toEqual(404);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('User not found');
      expect(mockSession.abortTransaction).toHaveBeenCalled();
    });

    it('should handle internal server errors', async () => {
      User.findOneAndUpdate.mockImplementation(() => {
        throw new Error('DB error during update');
      });
      User.startSession.mockResolvedValue(mockSession);


      const res = await request(app)
        .post('/api/admin/users/user1/approve')
        .send({ email: 'user@example.com' });

      expect(res.statusCode).toEqual(500);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('DB error during update'); // Message comes from re-thrown error
      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error approving user:'), expect.any(Error));
    });
  });

  describe('bypassPayment', () => {
    it('should bypass payment for a user successfully', async () => {
      const mockUser = {
        _id: 'user2',
        email: 'user2@example.com',
        hasPaid: false,
        paymentHistory: [],
        select: jest.fn().mockReturnThis(),
      };
      User.findOneAndUpdate.mockResolvedValue({ ...mockUser, hasPaid: true, paymentHistory: [{ adminOverride: 'adminUserId123' }] });
      User.startSession.mockResolvedValue(mockSession);

      const res = await request(app)
        .post('/api/admin/users/bypass-payment')
        .send({ email: 'user2@example.com' });

      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('success');
      expect(res.body.message).toEqual('Payment bypassed');
      expect(res.body.data.hasPaid).toBe(true);
      expect(res.body.data.paymentHistory[0].adminOverride).toEqual('adminUserId123');
      expect(User.findOneAndUpdate).toHaveBeenCalledWith(
        { email: 'user2@example.com' },
        {
          hasPaid: true,
          $push: { paymentHistory: { adminOverride: 'adminUserId123' } }
        },
        { new: true, session: mockSession }
      );
      expect(mockSession.commitTransaction).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        'Admin action: bypass-payment',
        expect.objectContaining({ adminId: 'adminUserId123', target: 'user2@example.com' })
      );
    });

    it('should return 400 if email is missing', async () => {
      const res = await request(app)
        .post('/api/admin/users/bypass-payment')
        .send({});

      expect(res.statusCode).toEqual(400);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('Email required');
      expect(User.findOneAndUpdate).not.toHaveBeenCalled();
      expect(mockSession.startTransaction).not.toHaveBeenCalled();
    });

    it('should return 404 if user not found', async () => {
      User.findOneAndUpdate.mockResolvedValue(null);
      User.startSession.mockResolvedValue(mockSession);

      const res = await request(app)
        .post('/api/admin/users/bypass-payment')
        .send({ email: 'nonexistent@example.com' });

      expect(res.statusCode).toEqual(404);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('User not found');
      expect(mockSession.abortTransaction).toHaveBeenCalled();
    });

    it('should handle internal server errors', async () => {
      User.findOneAndUpdate.mockImplementation(() => {
        throw new Error('DB error bypassing payment');
      });
      User.startSession.mockResolvedValue(mockSession);


      const res = await request(app)
        .post('/api/admin/users/bypass-payment')
        .send({ email: 'user2@example.com' });

      expect(res.statusCode).toEqual(500);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('DB error bypassing payment');
      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error bypassing payment:'), expect.any(Error));
    });
  });

  describe('grantProPlus', () => {
    let mockUser;

    beforeEach(() => {
      mockUser = {
        _id: 'user3',
        email: 'user3@example.com',
        subscription: { isProPlus: false },
        select: jest.fn().mockReturnThis(),
      };
      User.findOne.mockResolvedValue(mockUser);
      User.findOneAndUpdate.mockResolvedValue({
        ...mockUser,
        subscription: {
          isProPlus: true,
          subscribedAt: new Date(),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        }
      });
      User.startSession.mockResolvedValue(mockSession);
    });

    it('should grant Pro+ subscription successfully', async () => {
      const res = await request(app)
        .post('/api/admin/users/grant-proplus')
        .send({ email: 'user3@example.com' });

      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('success');
      expect(res.body.message).toEqual('Pro+ granted');
      expect(res.body.data.subscription.isProPlus).toBe(true);
      expect(User.findOne).toHaveBeenCalledWith({ email: 'user3@example.com' });
      expect(User.findOneAndUpdate).toHaveBeenCalledWith(
        { email: 'user3@example.com' },
        expect.objectContaining({ 'subscription.isProPlus': true }),
        { new: true, session: mockSession }
      );
      expect(mockSession.commitTransaction).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        'Admin action: grant-pro-plus',
        expect.objectContaining({ adminId: 'adminUserId123', target: 'user3@example.com' })
      );
    });

    it('should return 400 if email is missing', async () => {
      const res = await request(app)
        .post('/api/admin/users/grant-proplus')
        .send({});

      expect(res.statusCode).toEqual(400);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('Email required');
      expect(User.findOne).not.toHaveBeenCalled();
      expect(mockSession.startTransaction).not.toHaveBeenCalled();
    });

    it('should return 404 if user not found', async () => {
      User.findOne.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/admin/users/grant-proplus')
        .send({ email: 'nonexistent@example.com' });

      expect(res.statusCode).toEqual(404);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('User not found');
      expect(mockSession.startTransaction).not.toHaveBeenCalled(); // No transaction if user not found early
    });

    it('should return 400 if user already has Pro+', async () => {
      mockUser.subscription.isProPlus = true;
      User.findOne.mockResolvedValue(mockUser);

      const res = await request(app)
        .post('/api/admin/users/grant-proplus')
        .send({ email: 'user3@example.com' });

      expect(res.statusCode).toEqual(400);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('User already has Pro+');
      expect(User.findOneAndUpdate).not.toHaveBeenCalled();
      expect(mockSession.startTransaction).not.toHaveBeenCalled();
    });

    it('should handle internal server errors', async () => {
      User.findOne.mockImplementation(() => {
        throw new Error('DB error during find');
      });

      const res = await request(app)
        .post('/api/admin/users/grant-proplus')
        .send({ email: 'user3@example.com' });

      expect(res.statusCode).toEqual(500);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('DB error during find');
      // No transaction started if User.findOne throws early
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error granting Pro+:'), expect.any(Error));
    });
  });

  describe('verifyKyc', () => {
    let mockUserForKyc;

    beforeEach(() => {
      mockUserForKyc = {
        _id: 'kycUser1',
        email: 'kyc@example.com',
        firstName: 'Kyc',
        kycStatus: 'pending',
        kycDocuments: [{ docType: 'PASSPORT', fileUrl: 'url', status: 'pending' }],
        transactions: [], // Required by select method to exclude
        select: jest.fn().mockReturnThis(),
      };
      User.findById.mockResolvedValue(mockUserForKyc);
      User.findByIdAndUpdate.mockResolvedValue(mockUserForKyc); // Simulate update returning the same mock user
      notificationService.create.mockResolvedValue({});
      notificationService.sendEmailNotification.mockResolvedValue({});
      User.startSession.mockResolvedValue(mockSession); // Ensure session is mocked for handleAdminAction
    });

    it('should approve KYC and send notifications', async () => {
      const res = await request(app)
        .post('/api/admin/kyc/verify')
        .send({ userId: 'kycUser1', action: 'approve' });

      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('success');
      expect(res.body.message).toEqual('User KYC status updated to approve');
      expect(User.findById).toHaveBeenCalledWith('kycUser1');
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
        'kycUser1',
        expect.objectContaining({ kycStatus: 'approved', 'kycDocuments.$[].status': 'verified' }),
        expect.objectContaining({ new: true, session: mockSession })
      );
      expect(mockSession.commitTransaction).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Admin action: verify-kyc-action', expect.any(Object));
      expect(notificationService.create).toHaveBeenCalledWith(
        'kycUser1', 'kyc', 'KYC Approved', 'Your identity verification has been approved.', expect.any(Object)
      );
      expect(notificationService.sendEmailNotification).toHaveBeenCalledWith(
        'kyc@example.com', 'KYC Approved', 'kycApproved', expect.any(Object)
      );
    });

    it('should reject KYC with a reason and send notifications', async () => {
      const res = await request(app)
        .post('/api/admin/kyc/verify')
        .send({ userId: 'kycUser1', action: 'reject', rejectionReason: 'Blurry photo' });

      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('success');
      expect(res.body.message).toEqual('User KYC status updated to reject');
      expect(User.findById).toHaveBeenCalledWith('kycUser1');
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
        'kycUser1',
        expect.objectContaining({
          kycStatus: 'rejected',
          'kycDocuments.$[].status': 'rejected',
          rejectionReason: 'Blurry photo'
        }),
        expect.objectContaining({ new: true, session: mockSession })
      );
      expect(mockSession.commitTransaction).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Admin action: verify-kyc-action', expect.any(Object));
      expect(notificationService.create).toHaveBeenCalledWith(
        'kycUser1', 'kyc', 'KYC Rejected', 'Your identity verification was rejected. Reason: Blurry photo', expect.any(Object)
      );
      expect(notificationService.sendEmailNotification).toHaveBeenCalledWith(
        'kyc@example.com', 'KYC Rejected', 'kycRejected', expect.objectContaining({ reason: 'Blurry photo' })
      );
    });

    it('should return 400 for invalid action', async () => {
      const res = await request(app)
        .post('/api/admin/kyc/verify')
        .send({ userId: 'kycUser1', action: 'invalid' });

      expect(res.statusCode).toEqual(400);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('Invalid input: User ID, valid action ("approve"/"reject"), and rejection reason (if rejecting) are required.');
      expect(User.findById).not.toHaveBeenCalled(); // Validation throws before DB interaction
      expect(mockSession.startTransaction).not.toHaveBeenCalled();
    });

    it('should return 400 if rejecting without a reason', async () => {
      const res = await request(app)
        .post('/api/admin/kyc/verify')
        .send({ userId: 'kycUser1', action: 'reject' }); // Missing rejectionReason

      expect(res.statusCode).toEqual(400);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('Invalid input: User ID, valid action ("approve"/"reject"), and rejection reason (if rejecting) are required.');
      expect(User.findById).not.toHaveBeenCalled();
      expect(mockSession.startTransaction).not.toHaveBeenCalled();
    });

    it('should return 404 if user not found', async () => {
      User.findById.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/admin/kyc/verify')
        .send({ userId: 'nonExistentKycUser', action: 'approve' });

      expect(res.statusCode).toEqual(404);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('User not found.');
      expect(mockSession.abortTransaction).toHaveBeenCalled(); // Transaction started, then aborted
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error during verifyKyc action:'), expect.any(Object));
    });

    it('should return 400 if KYC is already approved or rejected', async () => {
      mockUserForKyc.kycStatus = 'approved';
      User.findById.mockResolvedValue(mockUserForKyc);

      const res = await request(app)
        .post('/api/admin/kyc/verify')
        .send({ userId: 'kycUser1', action: 'approve' });

      expect(res.statusCode).toEqual(400);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('User KYC is already approved.');
      expect(mockSession.abortTransaction).toHaveBeenCalled();
    });

    it('should handle internal server errors during DB operations', async () => {
      User.findById.mockImplementationOnce(() => {
        throw new Error('Database error during find');
      });

      const res = await request(app)
        .post('/api/admin/kyc/verify')
        .send({ userId: 'kycUser1', action: 'approve' });

      expect(res.statusCode).toEqual(500);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('Database error during find');
      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error during verifyKyc action:'), expect.any(Object));
    });

    it('should handle errors during notification sending', async () => {
      notificationService.create.mockImplementation(() => {
        throw new Error('Notification service failed');
      });

      const res = await request(app)
        .post('/api/admin/kyc/verify')
        .send({ userId: 'kycUser1', action: 'approve' });

      expect(res.statusCode).toEqual(500);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('Notification service failed');
      expect(mockSession.commitTransaction).toHaveBeenCalled(); // Transaction should commit before notification failure
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error during verifyKyc action:'), expect.any(Object));
    });
  });
});
