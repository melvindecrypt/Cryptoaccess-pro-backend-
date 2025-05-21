// __tests__/controllers/adminController.test.js - Part 2 (Continuation)
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Decimal = require('decimal.js'); // For adjustBalance tests

// Mock external dependencies - Ensure all are mocked as in Part 1
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
const Withdrawal = require('../../models/Withdrawals');
const ArchiveUser = require('../../models/ArchiveUser');
const Wallet = require('../../models/Wallet');
const Transaction = require('../../models/Transaction');
const AuditLog = require('../../models/AuditLog');
const Notification = require('../../models/Notification');
const AdminWallet = require('../../models/AdminWallet');
const Settings = require('../../models/Settings');
const payoutService = require('../../services/payoutService');
const notificationService = require('../../services/notificationService'); // Renamed to avoid conflict

const adminController = require('../../controllers/adminController');
const { formatResponse } = require('../../utils/helpers');

let mongoServer;
let app;

// Mock session and transaction methods
const mockSession = {
  startTransaction: jest.fn(),
  commitTransaction: jest.fn(),
  abortTransaction: jest.fn(),
  endSession: jest.fn(),
  // Ensure that chaining methods like .session(session) work
  // For .populate, .select etc., you might need to mock them on the model directly
  // or return `this` if the mock is designed to be chained.
  populate: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
};


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
  app.use(express.urlencoded({ extended: true }));

  // Middleware to attach a mock user (admin) to req.user for protected routes
  app.use((req, res, next) => {
    // For adminLogin, req.user will be null, which is fine.
    // For other routes, assume an authenticated admin user.
    if (!req.path.includes('/admin/login')) { // Exclude login path
      req.user = { _id: 'adminUserId123', email: 'admin@example.com', isAdmin: true, userId: 'adminUserId123' };
    }
    next();
  });

  // Define mock routes for all functions
  // (Re-listing routes for completeness, assuming they are in the same overall app)
  app.post('/api/admin/login', async (req, res) => {
    const { email, password } = req.body;
    try {
      if (!email || !password || !/^\S+@\S+\.\S+$/.test(email)) {
        return res.status(400).json(formatResponse(false, 'Valid email and password required'));
      }
      const user = await User.findOne({ email }).select('+password +isAdmin +isSuspended').lean();
      if (!user?.isAdmin) {
        logger.warn('Admin login attempt failed: Invalid credentials', { email });
        return res.status(403).json(formatResponse(false, 'Access denied'));
      }
      if (user.isSuspended) {
        logger.warn('Suspended admin login attempt', { userId: user._id });
        return res.status(403).json(formatResponse(false, 'Account suspended'));
      }
      const isMatch = await require('bcryptjs').compare(password, user.password); // Use actual bcrypt here
      if (!isMatch) {
        logger.warn('Admin login failed: Password mismatch', { email });
        return res.status(401).json(formatResponse(false, 'Invalid credentials'));
      }
      const token = require('jsonwebtoken').sign({ // Use actual jwt here
        userId: user._id,
        email: user.email,
        isAdmin: true,
        permissions: ['admin'],
        authFreshness: Date.now()
      }, process.env.JWT_SECRET, { expiresIn: '15m' });
      res.cookie('adminToken', token, {
        httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: 900000
      });
      logger.info('Admin login successful', { userId: user._id });
      res.json(formatResponse(true, 'Authentication successful', {
        user: { id: user._id, email: user.email, lastLogin: user.lastLogin }
      }));
    } catch (err) {
      logger.error('Admin login error', { error: err.stack });
      res.status(500).json(formatResponse(false, 'Internal server error'));
    }
  });


  app.post('/api/admin/users/:id/approve', adminController.approveUser);
  app.post('/api/admin/users/bypass-payment', adminController.bypassPayment);
  app.post('/api/admin/users/grant-proplus', adminController.grantProPlus);
  app.post('/api/admin/kyc/verify', adminController.verifyKyc);
  app.put('/api/admin/users/balance', adminController.updateBalance);
  app.put('/api/admin/users/suspend', adminController.suspendUser);
  app.post('/api/admin/logout', adminController.logout);
  app.post('/api/admin/send-funds', adminController.sendFunds);
  app.get('/api/admin/users', adminController.getUsers);
  app.put('/api/admin/users/verify-email', adminController.verifyEmail);
  app.delete('/api/admin/users/:id', adminController.deleteUser);
  app.post('/api/admin/adjust-balance', adminController.adjustBalance);
  app.post('/api/admin/process-payouts', adminController.processPayouts);
  app.put('/api/admin/users/:id', adminController.updateUser);
  app.get('/api/admin/users/:userId/wallet', adminController.getUserWallet);
  app.get('/api/admin/users/:userId/kyc-docs', adminController.getKycDocs);
  // Note: getKycPreview is skipped as it depends on middleware setting req.localFilePath
  // and is more about serving files than controller logic.

  app.get('/api/admin/withdrawals/pending', adminController.getPendingWithdrawals);
  app.post('/api/admin/withdrawals/:id/process', adminController.processWithdrawal);
  app.get('/api/admin/admin-wallets', adminController.getAdminWallets);
  app.put('/api/admin/admin-wallets', adminController.updateAdminWallets);
  app.get('/api/admin/audit-logs', adminController.getAuditLogs);
  app.get('/api/admin/notifications', adminController.getNotifications);
  app.post('/api/admin/send-notification', adminController.notificationService);
  app.get('/api/admin/settings', adminController.getSettings);
  app.put('/api/admin/settings', adminController.updateSettings);

});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
  jest.clearAllMocks();
});

describe('AdminController - User and Financial Management (Part 2)', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    User.startSession.mockResolvedValue(mockSession);
    mockSession.startTransaction.mockReturnThis();
    mockSession.commitTransaction.mockReturnThis();
    mockSession.abortTransaction.mockReturnThis();
    mockSession.endSession.mockReturnThis();

    // Reset specific mocks that might be set in previous tests
    User.findOne.mockReset();
    User.findOneAndUpdate.mockReset();
    User.findById.mockReset();
    User.findByIdAndUpdate.mockReset();
    User.countDocuments.mockReset();
    User.find.mockReset();
    Withdrawal.find.mockReset();
    Withdrawal.findById.mockReset();
    Withdrawal.findByIdAndUpdate.mockReset(); // Important for processWithdrawal
    ArchiveUser.create.mockReset();
    Wallet.deleteMany.mockReset();
    Transaction.deleteMany.mockReset();
    AuditLog.create.mockReset();
    AdminWallet.findOne.mockReset();
    AdminWallet.updateOne.mockReset();
    Settings.findOne.mockReset();
    Settings.updateOne.mockReset();
    Notification.find.mockReset();
    notificationService.create.mockReset();
    notificationService.sendEmailNotification.mockReset();
    payoutService.processROIPayouts.mockReset();

    process.env.JWT_SECRET = 'test_jwt_secret';
  });

  describe('updateBalance', () => {
    it('should update user balance successfully', async () => {
      const mockUser = {
        _id: 'userBalance1',
        email: 'balance@example.com',
        virtualBalances: { USD: 100 },
        select: jest.fn().mockReturnThis(),
      };
      User.findOneAndUpdate.mockResolvedValue({ ...mockUser, virtualBalances: { USD: 500 } });
      User.startSession.mockResolvedValue(mockSession);

      const res = await request(app)
        .put('/api/admin/users/balance')
        .send({ email: 'balance@example.com', currency: 'USD', amount: 500 });

      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('success');
      expect(res.body.message).toEqual('Balance updated');
      expect(res.body.data.newBalance).toEqual(500);
      expect(User.findOneAndUpdate).toHaveBeenCalledWith(
        { email: 'balance@example.com' },
        { $set: { 'virtualBalances.USD': 500 } },
        { new: true, session: mockSession }
      );
      expect(mockSession.commitTransaction).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        'Admin action: update-balance',
        expect.objectContaining({ adminId: 'adminUserId123', target: 'balance@example.com' })
      );
    });

    it('should return 400 for invalid parameters', async () => {
      const res = await request(app)
        .put('/api/admin/users/balance')
        .send({ email: 'balance@example.com', currency: 'USD', amount: 'notANumber' });

      expect(res.statusCode).toEqual(400);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('Invalid parameters');
      expect(User.findOneAndUpdate).not.toHaveBeenCalled();
      expect(mockSession.startTransaction).not.toHaveBeenCalled();
    });

    it('should return 404 if user not found', async () => {
      User.findOneAndUpdate.mockResolvedValue(null);
      User.startSession.mockResolvedValue(mockSession);

      const res = await request(app)
        .put('/api/admin/users/balance')
        .send({ email: 'nonexistent@example.com', currency: 'USD', amount: 100 });

      expect(res.statusCode).toEqual(404);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('User not found');
      expect(mockSession.abortTransaction).toHaveBeenCalled();
    });

    it('should handle internal server errors', async () => {
      User.findOneAndUpdate.mockImplementation(() => {
        throw new Error('DB error updating balance');
      });
      User.startSession.mockResolvedValue(mockSession);

      const res = await request(app)
        .put('/api/admin/users/balance')
        .send({ email: 'balance@example.com', currency: 'USD', amount: 100 });

      expect(res.statusCode).toEqual(500);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('DB error updating balance');
      expect(mockSession.abortTransaction).toHaveBeenCalled();
    });
  });

  describe('suspendUser', () => {
    let mockUser;
    beforeEach(() => {
      mockUser = {
        _id: 'userSuspend1',
        email: 'suspend@example.com',
        isSuspended: false,
        suspensionHistory: [],
        select: jest.fn().mockReturnThis(),
      };
      User.findOneAndUpdate.mockResolvedValue(mockUser); // Initially resolve to the user before update
      User.startSession.mockResolvedValue(mockSession);
    });

    it('should suspend a user successfully', async () => {
      User.findOneAndUpdate.mockResolvedValue({ ...mockUser, isSuspended: true, suspensionHistory: [{ date: expect.any(Date), admin: 'adminUserId123', reason: 'Abuse' }] });

      const res = await request(app)
        .put('/api/admin/users/suspend')
        .send({ email: 'suspend@example.com', suspend: true, reason: 'Abuse' });

      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('success');
      expect(res.body.message).toEqual('User suspended');
      expect(res.body.data.isSuspended).toBe(true);
      expect(User.findOneAndUpdate).toHaveBeenCalledWith(
        { email: 'suspend@example.com' },
        expect.objectContaining({ isSuspended: true }),
        expect.objectContaining({ new: true, session: mockSession })
      );
      expect(mockSession.commitTransaction).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        'Admin action: suspend-user',
        expect.objectContaining({ adminId: 'adminUserId123', target: 'suspend@example.com' })
      );
    });

    it('should unsuspend a user successfully', async () => {
      User.findOneAndUpdate.mockResolvedValue({ ...mockUser, isSuspended: false }); // User is now unsuspended

      const res = await request(app)
        .put('/api/admin/users/suspend')
        .send({ email: 'suspend@example.com', suspend: false });

      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('success');
      expect(res.body.message).toEqual('User unsuspended');
      expect(res.body.data.isSuspended).toBe(false);
      expect(User.findOneAndUpdate).toHaveBeenCalledWith(
        { email: 'suspend@example.com' },
        expect.objectContaining({ isSuspended: false }),
        expect.objectContaining({ new: true, session: mockSession })
      );
      expect(mockSession.commitTransaction).toHaveBeenCalled();
    });

    it('should return 400 for invalid parameters', async () => {
      const res = await request(app)
        .put('/api/admin/users/suspend')
        .send({ email: 'suspend@example.com', suspend: 'notABoolean' });

      expect(res.statusCode).toEqual(400);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('Invalid parameters');
      expect(User.findOneAndUpdate).not.toHaveBeenCalled();
      expect(mockSession.startTransaction).not.toHaveBeenCalled();
    });

    it('should return 404 if user not found', async () => {
      User.findOneAndUpdate.mockResolvedValue(null);

      const res = await request(app)
        .put('/api/admin/users/suspend')
        .send({ email: 'nonexistent@example.com', suspend: true });

      expect(res.statusCode).toEqual(404);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('User not found');
      expect(mockSession.abortTransaction).toHaveBeenCalled();
    });

    it('should handle internal server errors', async () => {
      User.findOneAndUpdate.mockImplementation(() => {
        throw new Error('DB error suspending user');
      });

      const res = await request(app)
        .put('/api/admin/users/suspend')
        .send({ email: 'suspend@example.com', suspend: true });

      expect(res.statusCode).toEqual(500);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('DB error suspending user');
      expect(mockSession.abortTransaction).toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('should clear adminToken cookie and log out successfully', async () => {
      const res = await request(app)
        .post('/api/admin/logout');

      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('success');
      expect(res.body.message).toEqual('Session terminated');
      // Verify that the 'Set-Cookie' header is present and instructs to clear 'adminToken'
      // This often means setting maxAge to 0 or an expiration date in the past.
      expect(res.headers['set-cookie'][0]).toMatch(/adminToken=; Path=\/; Expires=Thu, 01 Jan 1970 00:00:00 GMT/);
      expect(logger.info).toHaveBeenCalledWith('Admin logout', { userId: 'adminUserId123' });
    });
  });

  describe('sendFunds', () => {
    let mockUser;
    beforeEach(() => {
      mockUser = {
        _id: 'userSendFunds',
        email: 'sendfunds@example.com',
        virtualBalances: { USD: 100, BTC: 0.1 },
        transactions: [],
        save: jest.fn().mockResolvedValue(true),
      };
      User.findOne.mockResolvedValue(mockUser);
      User.startSession.mockResolvedValue(mockSession);
      // Mock AuditLog.create
      AuditLog.create.mockResolvedValue({});
      // Define what User.schema.path('virtualBalances').schema.paths returns for currency validation
      // This is a simplified mock. In reality, you'd mock the entire Mongoose schema path.
      Object.defineProperty(User, 'schema', {
        value: {
          path: jest.fn().mockReturnValue({
            schema: {
              paths: {
                USD: {}, BTC: {}, ETH: {}
              }
            }
          })
        }
      });
    });

    it('should successfully send funds to a user', async () => {
      const res = await request(app)
        .post('/api/admin/send-funds')
        .send({ recipientEmail: 'sendfunds@example.com', currency: 'USD', amount: 50 });

      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('success');
      expect(res.body.message).toEqual('Funds sent successfully.');
      expect(res.body.data.newBalance).toEqual(150); // 100 + 50
      expect(mockUser.virtualBalances.USD).toEqual(150);
      expect(mockUser.transactions.length).toEqual(1);
      expect(mockUser.transactions[0].type).toEqual('admin-credit');
      expect(mockUser.save).toHaveBeenCalledWith({ session: mockSession });
      expect(AuditLog.create).toHaveBeenCalledWith(
        [{ adminId: 'adminUserId123', action: 'send-funds', targetUser: 'userSendFunds', details: { currency: 'USD', amount: 50 }, timestamp: expect.any(Date) }],
        { session: mockSession }
      );
      expect(mockSession.commitTransaction).toHaveBeenCalled();
    });

    it('should initialize currency balance if not existing', async () => {
      mockUser.virtualBalances = { USD: 100 }; // No ETH initially
      User.findOne.mockResolvedValue(mockUser);

      const res = await request(app)
        .post('/api/admin/send-funds')
        .send({ recipientEmail: 'sendfunds@example.com', currency: 'ETH', amount: 10 });

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.newBalance).toEqual(10);
      expect(mockUser.virtualBalances.ETH).toEqual(10);
      expect(mockUser.save).toHaveBeenCalled();
      expect(mockSession.commitTransaction).toHaveBeenCalled();
    });


    it('should return 400 for invalid amount', async () => {
      const res = await request(app)
        .post('/api/admin/send-funds')
        .send({ recipientEmail: 'sendfunds@example.com', currency: 'USD', amount: -10 });

      expect(res.statusCode).toEqual(400);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('Valid recipientEmail, currency, and positive amount are required.');
      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(User.findOne).not.toHaveBeenCalled(); // Validation throws early
    });

    it('should return 400 for unsupported currency', async () => {
      const res = await request(app)
        .post('/api/admin/send-funds')
        .send({ recipientEmail: 'sendfunds@example.com', currency: 'XYZ', amount: 10 });

      expect(res.statusCode).toEqual(400);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toContain('Unsupported currency.');
      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(User.findOne).not.toHaveBeenCalled(); // Validation throws early
    });

    it('should return 404 if recipient user not found', async () => {
      User.findOne.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/admin/send-funds')
        .send({ recipientEmail: 'nonexistent@example.com', currency: 'USD', amount: 10 });

      expect(res.statusCode).toEqual(404);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('Recipient user not found.');
      expect(mockSession.abortTransaction).toHaveBeenCalled();
    });

    it('should handle internal server errors', async () => {
      User.findOne.mockImplementation(() => {
        throw new Error('DB error finding user');
      });

      const res = await request(app)
        .post('/api/admin/send-funds')
        .send({ recipientEmail: 'sendfunds@example.com', currency: 'USD', amount: 10 });

      expect(res.statusCode).toEqual(500);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('Failed to send funds. Try again.');
      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Admin send-funds error:'), expect.any(Error));
    });
  });

  describe('getUsers', () => {
    it('should fetch all users with pagination and total count', async () => {
      const mockUsers = [{ _id: 'u1', email: 'a@a.com' }, { _id: 'u2', email: 'b@b.com' }];
      User.countDocuments.mockResolvedValue(100);
      User.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockUsers),
      });

      const res = await request(app).get('/api/admin/users?page=2&limit=2');

      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('success');
      expect(res.body.message).toEqual('Users fetched');
      expect(res.body.data.users).toEqual(mockUsers);
      expect(res.body.data.totalCount).toEqual(100);
      expect(res.body.data.totalPages).toEqual(50);
      expect(User.countDocuments).toHaveBeenCalledWith({});
      expect(User.find).toHaveBeenCalledWith({});
      expect(User.find().skip).toHaveBeenCalledWith(2); // (page - 1) * limit
      expect(User.find().limit).toHaveBeenCalledWith(2);
    });

    it('should filter users by kycStatus and isProPlus', async () => {
      User.countDocuments.mockResolvedValue(10);
      User.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      });

      const res = await request(app).get('/api/admin/users?status=pending&isProPlus=true');

      expect(res.statusCode).toEqual(200);
      expect(User.countDocuments).toHaveBeenCalledWith({ kycStatus: 'pending', 'subscription.isProPlus': true });
      expect(User.find).toHaveBeenCalledWith({ kycStatus: 'pending', 'subscription.isProPlus': true });
    });

    it('should handle internal server errors', async () => {
      User.countDocuments.mockImplementation(() => {
        throw new Error('DB error counting users');
      });

      const res = await request(app).get('/api/admin/users');

      expect(res.statusCode).toEqual(500);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('Failed to fetch users');
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Admin user list error:'));
    });
  });

  describe('verifyEmail', () => {
    let mockUser;
    beforeEach(() => {
      mockUser = {
        _id: 'userEmailVerify',
        email: 'verify@example.com',
        isVerified: false,
        select: jest.fn().mockReturnThis(),
      };
      User.findOneAndUpdate.mockResolvedValue(mockUser); // Resolve with the user before update
    });

    it('should verify user email successfully', async () => {
      User.findOneAndUpdate.mockResolvedValue({ ...mockUser, isVerified: true });

      const res = await request(app)
        .put('/api/admin/users/verify-email')
        .send({ email: 'verify@example.com', verify: true });

      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('success');
      expect(res.body.message).toEqual('Email verified');
      expect(User.findOneAndUpdate).toHaveBeenCalledWith(
        { email: 'verify@example.com' },
        { isVerified: true },
        { new: true }
      );
      expect(logger.info).toHaveBeenCalledWith('Admin admin@example.com verified verify@example.com');
    });

    it('should unverify user email successfully', async () => {
      User.findOneAndUpdate.mockResolvedValue({ ...mockUser, isVerified: false });

      const res = await request(app)
        .put('/api/admin/users/verify-email')
        .send({ email: 'verify@example.com', verify: false });

      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('success');
      expect(res.body.message).toEqual('Email unverified');
      expect(User.findOneAndUpdate).toHaveBeenCalledWith(
        { email: 'verify@example.com' },
        { isVerified: false },
        { new: true }
      );
      expect(logger.info).toHaveBeenCalledWith('Admin admin@example.com unverified verify@example.com');
    });

    it('should return 404 if user not found', async () => {
      User.findOneAndUpdate.mockResolvedValue(null);

      const res = await request(app)
        .put('/api/admin/users/verify-email')
        .send({ email: 'nonexistent@example.com', verify: true });

      expect(res.statusCode).toEqual(404);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('User not found');
    });

    it('should handle internal server errors', async () => {
      User.findOneAndUpdate.mockImplementation(() => {
        throw new Error('DB error email verify');
      });

      const res = await request(app)
        .put('/api/admin/users/verify-email')
        .send({ email: 'verify@example.com', verify: true });

      expect(res.statusCode).toEqual(500);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('Failed to update verification');
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Email verification error:'));
    });
  });

  describe('deleteUser', () => {
    let mockTargetUser;
    beforeEach(() => {
      mockTargetUser = {
        _id: 'userToDelete',
        email: 'todelete@example.com',
        isAdmin: false,
        toObject: jest.fn().mockReturnValue({ _id: 'userToDelete', email: 'todelete@example.com' }), // Simulate .toObject()
        equals: jest.fn((id) => id === 'userToDelete'), // Simulate comparison for self-deletion
      };
      User.findById.mockResolvedValue(mockTargetUser);
      User.deleteOne.mockResolvedValue({ deletedCount: 1 });
      ArchiveUser.create.mockResolvedValue({});
      Wallet.deleteMany.mockResolvedValue({ deletedCount: 1 });
      Transaction.deleteMany.mockResolvedValue({ deletedCount: 1 });
      mongoose.startSession.mockResolvedValue(mockSession);
    });

    it('should delete a user successfully and archive data', async () => {
      const res = await request(app)
        .delete('/api/admin/users/userToDelete')
        .send({ reason: 'Inactive account' });

      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('success');
      expect(res.body.message).toEqual('User deleted successfully');
      expect(res.body.data.userId).toEqual('userToDelete');
      expect(User.findById).toHaveBeenCalledWith('userToDelete');
      expect(ArchiveUser.create).toHaveBeenCalledWith(
        [expect.objectContaining({ user: mockTargetUser.toObject(), deletedBy: 'adminUserId123', reason: 'Inactive account' })],
        { session: mockSession }
      );
      expect(Wallet.deleteMany).toHaveBeenCalledWith({ userId: 'userToDelete' });
      expect(Transaction.deleteMany).toHaveBeenCalledWith({ userId: 'userToDelete' });
      expect(User.deleteOne).toHaveBeenCalledWith({ _id: 'userToDelete' });
      expect(mockSession.commitTransaction).toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith('ADMIN ACTION: User deleted', expect.any(Object));
    });

    it('should return 404 if user not found', async () => {
      User.findById.mockResolvedValue(null);

      const res = await request(app)
        .delete('/api/admin/users/nonExistentUser');

      expect(res.statusCode).toEqual(404);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('User not found');
      expect(mockSession.abortTransaction).toHaveBeenCalled();
    });

    it('should return 403 if trying to delete self', async () => {
      mockTargetUser._id = 'adminUserId123'; // Make target user the admin
      mockTargetUser.equals.mockImplementation((id) => id === 'adminUserId123'); // Simulate self-equals

      const res = await request(app)
        .delete('/api/admin/users/adminUserId123');

      expect(res.statusCode).toEqual(403);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('Cannot delete yourself');
      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(ArchiveUser.create).not.toHaveBeenCalled();
    });

    it('should return 403 if trying to delete another admin', async () => {
      mockTargetUser._id = 'anotherAdminId';
      mockTargetUser.isAdmin = true;
      User.findById.mockResolvedValue(mockTargetUser); // Ensure findById returns an admin

      const res = await request(app)
        .delete('/api/admin/users/anotherAdminId');

      expect(res.statusCode).toEqual(403);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('Cannot delete other admins');
      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(ArchiveUser.create).not.toHaveBeenCalled();
    });

    it('should handle internal server errors', async () => {
      User.findById.mockImplementation(() => {
        throw new Error('DB error during find');
      });

      const res = await request(app)
        .delete('/api/admin/users/userToDelete');

      expect(res.statusCode).toEqual(500);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('Deletion failed. Please try again.');
      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('USER DELETION FAILED:'), expect.any(Object));
    });
  });

  describe('adjustBalance', () => {
    let mockUser;
    beforeEach(() => {
      mockUser = {
        _id: 'userAdjustBalance',
        email: 'adjust@example.com',
        virtualBalances: { USD: 100 },
        transactions: [],
        save: jest.fn().mockResolvedValue(true),
      };
      User.findById.mockResolvedValue(mockUser);
      mongoose.startSession.mockResolvedValue(mockSession);
    });

    it('should increase balance successfully', async () => {
      const res = await request(app)
        .post('/api/admin/adjust-balance')
        .send({ userId: 'userAdjustBalance', currency: 'USD', amount: 50, reason: 'Manual credit' });

      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('success');
      expect(res.body.message).toEqual('Balance updated');
      expect(res.body.data.newBalance).toEqual(150);
      expect(mockUser.virtualBalances.USD).toEqual(150);
      expect(mockUser.transactions.length).toEqual(1);
      expect(mockUser.transactions[0].type).toEqual('admin_adjustment');
      expect(mockUser.transactions[0].amount).toEqual(50);
      expect(mockUser.transactions[0].reason).toEqual('Manual credit');
      expect(mockUser.save).toHaveBeenCalledWith({ session: mockSession });
      expect(mockSession.commitTransaction).toHaveBeenCalled();
    });

    it('should decrease balance successfully with negative amount', async () => {
      const res = await request(app)
        .post('/api/admin/adjust-balance')
        .send({ userId: 'userAdjustBalance', currency: 'USD', amount: -20, reason: 'Correction' });

      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('success');
      expect(res.body.data.newBalance).toEqual(80);
      expect(mockUser.virtualBalances.USD).toEqual(80);
      expect(mockUser.transactions[0].amount).toEqual(-20);
    });

    it('should handle currency not existing by initializing to 0 then adding', async () => {
      mockUser.virtualBalances = {}; // Empty balances
      User.findById.mockResolvedValue(mockUser);

      const res = await request(app)
        .post('/api/admin/adjust-balance')
        .send({ userId: 'userAdjustBalance', currency: 'EUR', amount: 30, reason: 'Initial EUR credit' });

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.newBalance).toEqual(30);
      expect(mockUser.virtualBalances.EUR).toEqual(30);
    });

    it('should return 400 for invalid currency format', async () => {
      const res = await request(app)
        .post('/api/admin/adjust-balance')
        .send({ userId: 'userAdjustBalance', currency: 'usd', amount: 10 }); // Lowercase currency

      expect(res.statusCode).toEqual(400);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('Invalid currency format');
      expect(User.findById).not.toHaveBeenCalled();
      expect(mockSession.startTransaction).not.toHaveBeenCalled();
    });

    it('should return 404 if user not found', async () => {
      User.findById.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/admin/adjust-balance')
        .send({ userId: 'nonExistentUser', currency: 'USD', amount: 10 });

      expect(res.statusCode).toEqual(404);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('User not found');
      expect(mockSession.abortTransaction).toHaveBeenCalled();
    });

    it('should handle internal server errors', async () => {
      User.findById.mockImplementation(() => {
        throw new Error('DB error finding user');
      });

      const res = await request(app)
        .post('/api/admin/adjust-balance')
        .send({ userId: 'userAdjustBalance', currency: 'USD', amount: 10 });

      expect(res.statusCode).toEqual(400); // The original code catches and returns error.message with 400
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('DB error finding user');
      expect(mockSession.abortTransaction).toHaveBeenCalled();
    });
  });

  describe('processPayouts', () => {
    it('should call payoutService to process ROI payouts successfully', async () => {
      payoutService.processROIPayouts.mockResolvedValue(true);

      const res = await request(app)
        .post('/api/admin/process-payouts');

      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('success');
      expect(res.body.message).toEqual('ROI payouts processed');
      expect(payoutService.processROIPayouts).toHaveBeenCalled();
    });

    it('should handle errors from payout service', async () => {
      payoutService.processROIPayouts.mockImplementation(() => {
        throw new Error('Payout failed due to external API');
      });

      const res = await request(app)
        .post('/api/admin/process-payouts');

      expect(res.statusCode).toEqual(500);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('Payout failed due to external API');
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error processing payouts:'), expect.any(Error));
    });
  });

  describe('updateUser', () => {
    let mockUser;
    beforeEach(() => {
      mockUser = {
        _id: 'userToUpdate',
        email: 'update@example.com',
        name: 'OldName',
        select: jest.fn().mockReturnThis(),
      };
      User.findByIdAndUpdate.mockResolvedValue({ ...mockUser, name: 'NewName' });
    });

    it('should update user profile successfully', async () => {
      const res = await request(app)
        .put('/api/admin/users/userToUpdate')
        .send({ name: 'NewName' });

      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('success');
      expect(res.body.message).toEqual('User updated');
      expect(res.body.data.name).toEqual('NewName');
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
        'userToUpdate',
        { name: 'NewName' },
        { new: true }
      );
    });

    it('should return 404 if user not found', async () => {
      User.findByIdAndUpdate.mockResolvedValue(null);

      const res = await request(app)
        .put('/api/admin/users/nonExistentUser')
        .send({ name: 'NewName' });

      expect(res.statusCode).toEqual(404);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('User not found');
    });

    it('should handle internal server errors', async () => {
      User.findByIdAndUpdate.mockImplementation(() => {
        throw new Error('DB error updating user');
      });

      const res = await request(app)
        .put('/api/admin/users/userToUpdate')
        .send({ name: 'NewName' });

      expect(res.statusCode).toEqual(500);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('Failed to update user');
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error updating user'), expect.any(Error));
    });
  });

  describe('getUserWallet', () => {
    let mockUser;
    beforeEach(() => {
      mockUser = {
        _id: 'userWallet',
        email: 'wallet@example.com',
        virtualBalances: { USD: 500, BTC: 0.05 },
        transactions: [{ type: 'deposit', amount: 100, currency: 'USD' }],
        select: jest.fn().mockReturnThis(),
      };
      User.findById.mockResolvedValue(mockUser);
    });

    it('should retrieve user wallet details successfully', async () => {
      const res = await request(app).get('/api/admin/users/userWallet/wallet');

      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('success');
      expect(res.body.message).toEqual('Wallet retrieved');
      expect(res.body.data.email).toEqual('wallet@example.com');
      expect(res.body.data.balances).toEqual({ USD: 500, BTC: 0.05 });
      expect(res.body.data.transactions).toEqual([{ type: 'deposit', amount: 100, currency: 'USD' }]);
      expect(User.findById).toHaveBeenCalledWith('userWallet');
    });

    it('should return 404 if user not found', async () => {
      User.findById.mockResolvedValue(null);

      const res = await request(app).get('/api/admin/users/nonExistentUser/wallet');

      expect(res.statusCode).toEqual(404);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('User not found');
    });

    it('should handle internal server errors', async () => {
      User.findById.mockImplementation(() => {
        throw new Error('DB error fetching wallet');
      });

      const res = await request(app).get('/api/admin/users/userWallet/wallet');

      expect(res.statusCode).toEqual(500);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('DB error fetching wallet');
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error retrieving user wallet:'));
    });
  });

  describe('getKycDocs', () => {
    let mockUser;
    beforeEach(() => {
      mockUser = {
        _id: 'userKycDocs',
        email: 'kycdocs@example.com',
        kycStatus: 'pending',
        kycDocuments: [{ docType: 'PASSPORT', fileUrl: 'https://example.com/passport.jpg', status: 'pending', uploadedAt: new Date() }],
        select: jest.fn().mockReturnThis(),
      };
      User.findById.mockResolvedValue(mockUser);
    });

    it('should retrieve user KYC documents successfully', async () => {
      const res = await request(app).get('/api/admin/users/userKycDocs/kyc-docs');

      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('success');
      expect(res.body.message).toEqual('KYC documents retrieved');
      expect(res.body.data.email).toEqual('kycdocs@example.com');
      expect(res.body.data.kycStatus).toEqual('pending');
      expect(res.body.data.documents.length).toEqual(1);
      expect(res.body.data.documents[0].docType).toEqual('PASSPORT');
      // Check the generated fileUrl for preview
      expect(res.body.data.documents[0].fileUrl).toEqual('/api/admin/kyc-preview?path=https%3A%2F%2Fexample.com%2Fpassport.jpg');
      expect(User.findById).toHaveBeenCalledWith('userKycDocs');
    });

    it('should return 404 if user not found', async () => {
      User.findById.mockResolvedValue(null);

      const res = await request(app).get('/api/admin/users/nonExistentUser/kyc-docs');

      expect(res.statusCode).toEqual(404);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('User not found');
    });

    it('should handle internal server errors', async () => {
      User.findById.mockImplementation(() => {
        throw new Error('DB error fetching KYC docs');
      });

      const res = await request(app).get('/api/admin/users/userKycDocs/kyc-docs');

      expect(res.statusCode).toEqual(500);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('Failed to retrieve documents');
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('KYC docs access error:'));
    });
  });

  describe('getPendingWithdrawals', () => {
    it('should retrieve pending withdrawals successfully', async () => {
      const mockWithdrawals = [
        {
          _id: 'w1',
          user: { _id: 'u1', email: 'user1@example.com' },
          amount: 100,
          currency: 'BTC',
          status: 'pending',
          createdAt: new Date(),
          populate: jest.fn().mockReturnThis(), // Mock populate methods on query chain
          sort: jest.fn().mockReturnThis(),
        },
      ];
      Withdrawal.find.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockResolvedValue(mockWithdrawals),
      });

      const res = await request(app).get('/api/admin/withdrawals/pending');

      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('success');
      expect(res.body.message).toEqual('Pending withdrawals');
      expect(res.body.data).toEqual(mockWithdrawals);
      expect(Withdrawal.find).toHaveBeenCalledWith({ status: 'pending' });
      expect(Withdrawal.find().populate).toHaveBeenCalledWith('user', 'email');
      expect(Withdrawal.find().sort).toHaveBeenCalledWith({ createdAt: -1 });
    });

    it('should return empty array if no pending withdrawals', async () => {
      Withdrawal.find.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockResolvedValue([]),
      });

      const res = await request(app).get('/api/admin/withdrawals/pending');

      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('success');
      expect(res.body.data).toEqual([]);
    });

    it('should handle internal server errors', async () => {
      Withdrawal.find.mockImplementation(() => {
        throw new Error('DB error fetching withdrawals');
      });

      const res = await request(app).get('/api/admin/withdrawals/pending');

      expect(res.statusCode).toEqual(500);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('DB error fetching withdrawals');
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error fetching pending withdrawals:'));
    });
  });

  describe('processWithdrawal', () => {
    let mockWithdrawal;
    let mockUser;
    beforeEach(() => {
      mockWithdrawal = {
        _id: 'withdrawal1',
        user: { _id: 'userForWithdrawal', email: 'withdrawal@example.com', virtualBalances: { BTC: 1.0 } },
        amount: 0.5,
        currency: 'BTC',
        status: 'pending',
        adminNotes: '',
        transactionHash: '',
        populate: jest.fn().mockReturnThis(),
        session: jest.fn().mockReturnThis(), // Mock .session() for chaining
        save: jest.fn().mockResolvedValue(true),
      };
      mockUser = {
        _id: 'userForWithdrawal',
        virtualBalances: { BTC: 1.0 }, // Initial user balance before refund
        save: jest.fn().mockResolvedValue(true),
      };
      Withdrawal.findById.mockResolvedValue(mockWithdrawal);
      User.findByIdAndUpdate.mockResolvedValue(mockUser); // For refund on reject
      mongoose.startSession.mockResolvedValue(mockSession);
    });

    it('should approve a withdrawal successfully', async () => {
      const res = await request(app)
        .post('/api/admin/withdrawals/withdrawal1/process')
        .send({ action: 'approve', adminNotes: 'Approved for processing' });

      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('success');
      expect(res.body.message).toEqual('Withdrawal approved');
      expect(mockWithdrawal.status).toEqual('approved');
      expect(mockWithdrawal.adminNotes).toEqual('Approved for processing');
      expect(mockWithdrawal.save).toHaveBeenCalledWith({ session: mockSession });
      expect(mockSession.commitTransaction).toHaveBeenCalled();
      expect(User.findByIdAndUpdate).not.toHaveBeenCalled(); // No refund on approve
    });

    it('should reject a withdrawal and refund user', async () => {
      const res = await request(app)
        .post('/api/admin/withdrawals/withdrawal1/process')
        .send({ action: 'reject', adminNotes: 'Insufficient balance on platform' });

      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('success');
      expect(res.body.message).toEqual('Withdrawal rejected');
      expect(mockWithdrawal.status).toEqual('rejected');
      expect(mockWithdrawal.adminNotes).toEqual('Insufficient balance on platform');
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
        'userForWithdrawal',
        { $inc: { 'virtualBalances.BTC': 0.5 } }, // Amount is 0.5, so it's added back
        { session: mockSession }
      );
      expect(mockWithdrawal.save).toHaveBeenCalledWith({ session: mockSession });
      expect(mockSession.commitTransaction).toHaveBeenCalled();
    });

    it('should complete a withdrawal with transaction hash', async () => {
      mockWithdrawal.status = 'approved'; // Set status to 'approved' for 'complete' action to make sense
      Withdrawal.findById.mockResolvedValue(mockWithdrawal);

      const res = await request(app)
        .post('/api/admin/withdrawals/withdrawal1/process')
        .send({ action: 'complete', transactionHash: '0xabc123def456' });

      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('success');
      expect(res.body.message).toEqual('Withdrawal completed');
      expect(mockWithdrawal.status).toEqual('processed');
      expect(mockWithdrawal.transactionHash).toEqual('0xabc123def456');
      expect(mockWithdrawal.processedAt).toBeInstanceOf(Date);
      expect(mockWithdrawal.save).toHaveBeenCalledWith({ session: mockSession });
      expect(mockSession.commitTransaction).toHaveBeenCalled();
    });

    it('should return 404 if withdrawal not found', async () => {
      Withdrawal.findById.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/admin/withdrawals/nonExistentWithdrawal/process')
        .send({ action: 'approve' });

      expect(res.statusCode).toEqual(404);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('Withdrawal not found');
      expect(mockSession.abortTransaction).toHaveBeenCalled();
    });

    it('should return 400 for invalid action', async () => {
      const res = await request(app)
        .post('/api/admin/withdrawals/withdrawal1/process')
        .send({ action: 'invalidAction' });

      expect(res.statusCode).toEqual(400);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('Invalid action');
      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(mockWithdrawal.save).not.toHaveBeenCalled();
    });

    it('should handle internal server errors', async () => {
      Withdrawal.findById.mockImplementation(() => {
        throw new Error('DB error processing withdrawal');
      });

      const res = await request(app)
        .post('/api/admin/withdrawals/withdrawal1/process')
        .send({ action: 'approve' });

      expect(res.statusCode).toEqual(400); // Original code returns 400 for caught errors, might be 500 in practice
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('DB error processing withdrawal');
      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error processing withdrawal:'), expect.any(Error));
    });
  });

  describe('getAdminWallets', () => {
    it('should retrieve admin wallets successfully', async () => {
      const mockWallets = { BTC: 'abc', ETH: 'xyz' };
      AdminWallet.findOne.mockResolvedValue(mockWallets);

      const res = await request(app).get('/api/admin/admin-wallets');

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.wallets).toEqual(mockWallets);
      expect(AdminWallet.findOne).toHaveBeenCalledWith({});
    });

    it('should return empty object if no admin wallets configured', async () => {
      AdminWallet.findOne.mockResolvedValue(null);

      const res = await request(app).get('/api/admin/admin-wallets');

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.wallets).toEqual(null); // Or an empty object if findOne returns {}
    });

    // Error handling is not explicitly in the provided snippet's try-catch for this function,
    // so we assume it relies on global error handling or is simpler.
  });

  describe('updateAdminWallets', () => {
    it('should update admin wallets successfully', async () => {
      const updateData = { BTC: 'new_btc_address', ETH: 'new_eth_address' };
      AdminWallet.updateOne.mockResolvedValue({ acknowledged: true, modifiedCount: 1 });

      const res = await request(app)
        .put('/api/admin/admin-wallets')
        .send(updateData);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toEqual('Wallet addresses updated');
      expect(AdminWallet.updateOne).toHaveBeenCalledWith({}, updateData, { upsert: true });
    });
  });

  describe('getAuditLogs', () => {
    it('should retrieve audit logs successfully', async () => {
      const mockLogs = [{ action: 'login', adminId: 'a1' }, { action: 'delete', adminId: 'a2' }];
      AuditLog.find.mockReturnValue({
        sort: jest.fn().mockResolvedValue(mockLogs),
      });

      const res = await request(app).get('/api/admin/audit-logs');

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.logs).toEqual(mockLogs);
      expect(AuditLog.find).toHaveBeenCalledWith({});
      expect(AuditLog.find().sort).toHaveBeenCalledWith({ timestamp: -1 });
    });
  });

  describe('getNotifications', () => {
    it('should retrieve notifications successfully', async () => {
      const mockNotifications = [{ title: 'New User', userId: 'u1' }, { title: 'KYC Pending', userId: 'u2' }];
      Notification.find.mockReturnValue({
        sort: jest.fn().mockResolvedValue(mockNotifications),
      });

      const res = await request(app).get('/api/admin/notifications');

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.notifications).toEqual(mockNotifications);
      expect(Notification.find).toHaveBeenCalledWith({});
      expect(Notification.find().sort).toHaveBeenCalledWith({ createdAt: -1 });
    });
  });

  describe('notificationService (Admin Controller function)', () => {
    beforeEach(() => {
      notificationService.create.mockResolvedValue({}); // Ensure the service mock is reset and resolves
    });

    it('should send notification to a specific user', async () => {
      const res = await request(app)
        .post('/api/admin/send-notification')
        .send({ title: 'Test Notif', message: 'Hello', target: 'specific', userId: 'targetUser1' });

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toEqual('Notification sent');
      expect(notificationService.create).toHaveBeenCalledWith('targetUser1', 'Test Notif', 'Hello');
      // No email send expected for 'specific' target by this snippet
    });

    // Test for 'all' target is commented out as the logic for 'all' is not implemented in the provided snippet
    // it('should send notification to all users', async () => {
    //   const res = await request(app)
    //     .post('/api/admin/send-notification')
    //     .send({ title: 'Global Announce', message: 'System update', target: 'all' });
    //
    //   expect(res.statusCode).toEqual(200);
    //   expect(res.body.success).toBe(true);
    //   expect(res.body.message).toEqual('Notification sent');
    //   // Expect relevant functions for 'all' users if implemented
    // });

    it('should handle missing userId for specific target', async () => {
      const res = await request(app)
        .post('/api/admin/send-notification')
        .send({ title: 'Test Notif', message: 'Hello', target: 'specific' });

      expect(res.statusCode).toEqual(200); // Assuming it just proceeds without error for this snippet
      expect(res.body.success).toBe(true);
      expect(res.body.message).toEqual('Notification sent');
      expect(notificationService.create).not.toHaveBeenCalled(); // No userId means no call
    });
  });

  describe('getSettings', () => {
    it('should retrieve settings successfully', async () => {
      const mockSettings = { siteName: 'My Platform', adminEmail: 'admin@site.com' };
      Settings.findOne.mockResolvedValue(mockSettings);

      const res = await request(app).get('/api/admin/settings');

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.settings).toEqual(mockSettings);
      expect(Settings.findOne).toHaveBeenCalledWith({});
    });
  });

  describe('updateSettings', () => {
    it('should update settings successfully', async () => {
      const updateData = { siteName: 'New Platform Name', enableKYC: true };
      Settings.updateOne.mockResolvedValue({ acknowledged: true, modifiedCount: 1 });

      const res = await request(app)
        .put('/api/admin/settings')
        .send(updateData);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toEqual('Settings updated');
      expect(Settings.updateOne).toHaveBeenCalledWith({}, updateData, { upsert: true });
    });
  });
});
