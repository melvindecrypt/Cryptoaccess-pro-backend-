// __tests__/controllers/userController.test.js
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Mock external dependencies
jest.mock('../../models/User');
jest.mock('../../models/Wallet');
jest.mock('../../models/Investment');
jest.mock('../../models/InvestmentPlan');
jest.mock('validator'); // Mock the 'validator' library

const User = require('../../models/User');
const Wallet = require('../../models/Wallet');
const Investment = require('../../models/Investment');
const InvestmentPlan = require('../../models/InvestmentPlan');
const userController = require('../../controllers/userController');
const { formatResponse } = require('../../utils/helpers'); // Assuming this is a shared helper

let mongoServer;
let app; // Mock Express app

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  // A minimal Express app setup for testing controllers directly with mocked req/res
  const express = require('express');
  app = express();
  app.use(express.json());

  // Define mock routes to test controller functions
  app.get('/api/user/profile', (req, res, next) => {
    req.user = { _id: 'testUserId123' }; // Mock user for profile endpoint
    userController.getProfile(req, res, next);
  });
  app.put('/api/user/security', (req, res, next) => {
    req.user = { _id: 'testUserId123' }; // Mock user for security endpoint
    userController.updateSecurity(req, res, next);
  });
  app.post('/api/user/kyc-upload', (req, res, next) => {
    req.user = { _id: 'testUserId123' }; // Mock user for KYC upload
    userController.uploadKycDoc(req, res, next);
  });
  app.get('/api/user/dashboard', (req, res, next) => {
    req.user = { _id: 'testUserId123' }; // Mock user for dashboard
    userController.getDashboardData(req, res, next);
  });
  app.get('/api/user/settings', (req, res, next) => {
    req.user = { _id: 'testUserId123' }; // Mock user for settings
    userController.getSettings(req, res, next);
  });
  app.put('/api/user/settings', (req, res, next) => {
    req.user = { _id: 'testUserId123' }; // Mock user for update settings
    userController.updateSettings(req, res, next);
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
  jest.clearAllMocks();
});

describe('UserController', () => {
  beforeEach(() => {
    jest.clearAllMocks(); // Clear mocks before each test
  });

  describe('getProfile', () => {
    it('should retrieve user profile successfully', async () => {
      const mockUser = {
        _id: 'testUserId123',
        email: 'test@example.com',
        name: 'John Doe',
        wallet: { balances: { USD: 1000 }, transactions: [] },
        select: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
      };
      User.findById.mockResolvedValue(mockUser);

      const res = await request(app).get('/api/user/profile');

      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('success');
      expect(res.body.message).toEqual('Profile retrieved successfully');
      expect(res.body.data._id).toEqual('testUserId123');
      expect(res.body.data.email).toEqual('test@example.com');
      expect(res.body.data.wallet.balances.USD).toEqual(1000);
      expect(User.findById).toHaveBeenCalledWith('testUserId123');
      expect(mockUser.populate).toHaveBeenCalledWith('wallet', 'balances transactions');
      expect(mockUser.select).toHaveBeenCalledWith('-password -__v -failedLoginAttempts -lockUntil');
    });

    it('should return 404 if user not found', async () => {
      User.findById.mockResolvedValue(null);

      const res = await request(app).get('/api/user/profile');

      expect(res.statusCode).toEqual(404);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('User not found');
    });

    it('should handle internal server errors', async () => {
      User.findById.mockImplementation(() => {
        throw new Error('Database error');
      });

      const res = await request(app).get('/api/user/profile');

      expect(res.statusCode).toEqual(500);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('Server error');
      expect(res.body.data.error).toEqual('Database error');
    });
  });

  describe('updateSecurity', () => {
    let mockUser;

    beforeEach(() => {
      mockUser = {
        _id: 'testUserId123',
        password: 'hashedCurrentPassword',
        comparePassword: jest.fn().mockResolvedValue(true),
        save: jest.fn().mockResolvedValue(true),
      };
      User.findById.mockResolvedValue(mockUser);
    });

    it('should update password successfully', async () => {
      const res = await request(app)
        .put('/api/user/security')
        .send({ currentPassword: 'oldPassword123', newPassword: 'NewStrongPassword123!' });

      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('success');
      expect(res.body.message).toEqual('Password updated successfully');
      expect(mockUser.comparePassword).toHaveBeenCalledWith('oldPassword123');
      expect(mockUser.password).toEqual('NewStrongPassword123!'); // In a real scenario, this would be hashed
      expect(mockUser.save).toHaveBeenCalled();
    });

    it('should return 400 if currentPassword or newPassword is missing', async () => {
      const res = await request(app)
        .put('/api/user/security')
        .send({ newPassword: 'NewStrongPassword123!' }); // Missing currentPassword

      expect(res.statusCode).toEqual(400);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('Both current and new password are required');
      expect(mockUser.save).not.toHaveBeenCalled();
    });

    it('should return 401 if current password is incorrect', async () => {
      mockUser.comparePassword.mockResolvedValue(false);

      const res = await request(app)
        .put('/api/user/security')
        .send({ currentPassword: 'wrongPassword', newPassword: 'NewStrongPassword123!' });

      expect(res.statusCode).toEqual(401);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('Current password is incorrect');
      expect(mockUser.save).not.toHaveBeenCalled();
    });

    it('should return 400 if new password is too weak', async () => {
      const res = await request(app)
        .put('/api/user/security')
        .send({ currentPassword: 'oldPassword123', newPassword: 'short' }); // Weak password

      expect(res.statusCode).toEqual(400);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('Password must be at least 12 characters with a number and uppercase letter');
      expect(mockUser.save).not.toHaveBeenCalled();
    });

    it('should handle internal server errors', async () => {
      User.findById.mockImplementation(() => {
        throw new Error('Database error');
      });

      const res = await request(app)
        .put('/api/user/security')
        .send({ currentPassword: 'oldPassword123', newPassword: 'NewStrongPassword123!' });

      expect(res.statusCode).toEqual(500);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('Server error');
      expect(res.body.data.error).toEqual('Database error');
      expect(mockUser.save).not.toHaveBeenCalled();
    });
  });

  describe('uploadKycDoc', () => {
    let mockUser;

    beforeEach(() => {
      mockUser = {
        _id: 'testUserId123',
        kycDocs: [],
        kycStatus: 'NOT_SUBMITTED',
      };
      User.findByIdAndUpdate.mockResolvedValue(mockUser);
    });

    it('should successfully upload a KYC document', async () => {
      const res = await request(app)
        .post('/api/user/kyc-upload')
        .send({ docType: 'PASSPORT', fileURL: 'http://example.com/passport.jpg' });

      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('success');
      expect(res.body.message).toEqual('Document uploaded for verification');
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
        'testUserId123',
        {
          $push: {
            kycDocs: {
              docType: 'PASSPORT',
              fileURL: 'http://example.com/passport.jpg',
              status: 'PENDING_REVIEW',
              uploadedAt: expect.any(Date),
            },
          },
        },
        { new: true, runValidators: true, select: 'kycDocs' }
      );
      expect(res.body.data.documents.length).toBeGreaterThan(0);
    });

    it('should return 400 if docType or fileURL is missing', async () => {
      const res = await request(app)
        .post('/api/user/kyc-upload')
        .send({ docType: 'PASSPORT' }); // Missing fileURL

      expect(res.statusCode).toEqual(400);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('Both docType and fileURL are required');
      expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('should return 400 for invalid document type', async () => {
      const res = await request(app)
        .post('/api/user/kyc-upload')
        .send({ docType: 'INVALID_TYPE', fileURL: 'http://example.com/doc.jpg' });

      expect(res.statusCode).toEqual(400);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('Invalid document type. Allowed types: PASSPORT, DRIVERS_LICENSE, NATIONAL_ID');
      expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('should return 404 if user not found', async () => {
      User.findByIdAndUpdate.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/user/kyc-upload')
        .send({ docType: 'PASSPORT', fileURL: 'http://example.com/passport.jpg' });

      expect(res.statusCode).toEqual(404);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('User not found');
    });

    it('should handle internal server errors', async () => {
      User.findByIdAndUpdate.mockImplementation(() => {
        throw new Error('Database error');
      });

      const res = await request(app)
        .post('/api/user/kyc-upload')
        .send({ docType: 'PASSPORT', fileURL: 'http://example.com/passport.jpg' });

      expect(res.statusCode).toEqual(500);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('Server error');
      expect(res.body.data.error).toEqual('Database error');
    });
  });

  describe('getDashboardData', () => {
    let mockUser, mockWallet, mockActiveInvestments, mockAvailablePlans;

    beforeEach(() => {
      mockUser = {
        _id: 'testUserId123',
        email: 'test@example.com',
        walletId: 'wallet123',
        kycStatus: 'VERIFIED',
        accessStatus: 'granted',
        proPlusStatus: true,
        select: jest.fn().mockReturnThis(),
      };
      mockWallet = {
        _id: 'wallet123',
        balances: { USD: 1000, BTC: 0.5 },
        select: jest.fn().mockReturnThis(),
      };
      mockActiveInvestments = [
        {
          _id: 'inv1',
          userId: 'testUserId123',
          amountInvested: 500,
          status: 'active',
          planId: { id: 'planA', name: 'Gold Plan', roi: 0.1, duration: 30 },
          populate: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
        },
      ];
      mockAvailablePlans = [
        {
          _id: 'planB',
          name: 'Silver Plan',
          minAmount: 100,
          roi: 0.05,
          duration: 15,
          select: jest.fn().mockReturnThis(),
        },
      ];

      User.findById.mockResolvedValue(mockUser);
      Wallet.findOne.mockResolvedValue(mockWallet);
      Investment.find.mockResolvedValue(mockActiveInvestments);
      InvestmentPlan.find.mockResolvedValue(mockAvailablePlans);
    });

    it('should retrieve dashboard data successfully for a granted user', async () => {
      const res = await request(app).get('/api/user/dashboard');

      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('success');
      expect(res.body.message).toEqual('Dashboard data retrieved successfully');
      expect(res.body.data.user.email).toEqual('test@example.com');
      expect(res.body.data.user.balance.USD).toEqual(1000);
      expect(res.body.data.investmentStatus.activePlans).toHaveLength(1);
      expect(res.body.data.investmentStatus.activePlans[0].name).toEqual('Gold Plan');
      expect(res.body.data.investmentStatus.availablePlans).toHaveLength(1);
      expect(res.body.data.investmentStatus.availablePlans[0].name).toEqual('Silver Plan');
      expect(res.body.data.proPlusStatus).toEqual('active');

      expect(User.findById).toHaveBeenCalledWith('testUserId123');
      expect(Wallet.findOne).toHaveBeenCalledWith({ userId: 'testUserId123' });
      expect(Investment.find).toHaveBeenCalledWith({ userId: 'testUserId123', status: 'active' });
      expect(InvestmentPlan.find).toHaveBeenCalledWith({ status: 'available' });
    });

    it('should return 404 if user not found', async () => {
      User.findById.mockResolvedValue(null);

      const res = await request(app).get('/api/user/dashboard');

      expect(res.statusCode).toEqual(404);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('User not found');
    });

    it('should return 403 if accessStatus is not granted', async () => {
      mockUser.accessStatus = 'pending';
      User.findById.mockResolvedValue(mockUser);

      const res = await request(app).get('/api/user/dashboard');

      expect(res.statusCode).toEqual(403);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('Access forbidden. Access fee may not have been paid.');
      expect(Wallet.findOne).not.toHaveBeenCalled(); // Should short-circuit
    });

    it('should handle internal server errors', async () => {
      User.findById.mockImplementation(() => {
        throw new Error('Database error');
      });

      const res = await request(app).get('/api/user/dashboard');

      expect(res.statusCode).toEqual(500);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('Server error fetching dashboard data');
      expect(res.body.data.error).toEqual('Database error');
    });
  });

  describe('getSettings', () => {
    it('should retrieve user settings successfully', async () => {
      const mockUser = {
        _id: 'testUserId123',
        name: 'John',
        email: 'john@example.com',
        language: 'en',
        select: jest.fn().mockReturnThis(),
      };
      User.findById.mockResolvedValue(mockUser);

      const res = await request(app).get('/api/user/settings');

      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('success');
      expect(res.body.message).toEqual('Settings retrieved successfully');
      expect(res.body.data.user.name).toEqual('John');
      expect(res.body.data.user.email).toEqual('john@example.com');
      expect(res.body.data.user.language).toEqual('en');
      expect(User.findById).toHaveBeenCalledWith('testUserId123');
      expect(mockUser.select).toHaveBeenCalledWith('name email language');
    });

    it('should return 404 if user not found', async () => {
      User.findById.mockResolvedValue(null);

      const res = await request(app).get('/api/user/settings');

      expect(res.statusCode).toEqual(404);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('User not found');
    });

    it('should handle internal server errors', async () => {
      User.findById.mockImplementation(() => {
        throw new Error('Database error');
      });

      const res = await request(app).get('/api/user/settings');

      expect(res.statusCode).toEqual(500);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('Server error');
      expect(res.body.data.error).toEqual('Database error');
    });
  });

  describe('updateSettings', () => {
    let mockUpdatedUser;

    beforeEach(() => {
      mockUpdatedUser = {
        _id: 'testUserId123',
        name: 'Jane',
        surname: 'Doe',
        phone: '1234567890',
        email: 'test@example.com',
      };
      User.findByIdAndUpdate.mockResolvedValue(mockUpdatedUser);
    });

    it('should update user profile settings successfully', async () => {
      const res = await request(app)
        .put('/api/user/settings')
        .send({ name: 'Jane', surname: 'Doe', phone: '1234567890' });

      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('success');
      expect(res.body.message).toEqual('Profile updated successfully.');
      expect(res.body.data.user.name).toEqual('Jane');
      expect(res.body.data.user.surname).toEqual('Doe');
      expect(res.body.data.user.phone).toEqual('1234567890');
      expect(res.body.data.user.email).toEqual('test@example.com'); // Ensure email is included
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
        'testUserId123',
        { $set: { name: 'Jane', surname: 'Doe', phone: '1234567890' } },
        { new: true, runValidators: true, select: 'name surname phone email' }
      );
    });

    it('should update only specified fields', async () => {
      const res = await request(app)
        .put('/api/user/settings')
        .send({ name: 'NewName' });

      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('success');
      expect(res.body.data.user.name).toEqual('NewName');
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
        'testUserId123',
        { $set: { name: 'NewName' } },
        expect.any(Object)
      );
    });

    it('should return 404 if user not found', async () => {
      User.findByIdAndUpdate.mockResolvedValue(null);

      const res = await request(app)
        .put('/api/user/settings')
        .send({ name: 'Jane' });

      expect(res.statusCode).toEqual(404);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('User not found');
    });

    it('should handle internal server errors', async () => {
      User.findByIdAndUpdate.mockImplementation(() => {
        throw new Error('Database error');
      });

      const res = await request(app)
        .put('/api/user/settings')
        .send({ name: 'Jane' });

      expect(res.statusCode).toEqual(500);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('Server error');
      expect(res.body.data.error).toEqual('Database error');
    });
  });
});
