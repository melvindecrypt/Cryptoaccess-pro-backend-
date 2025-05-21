// __tests__/controllers/subscriptionController.test.js
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Mock external dependencies
jest.mock('../../models/User');
jest.mock('../../utils/logger');
jest.mock('../../validators/subscriptionValidators');

const User = require('../../models/User');
const logger = require('../../utils/logger');
const { validateProPlusPayment } = require('../../validators/subscriptionValidators');
const subscriptionController = require('../../controllers/subscriptionController');
const { formatResponse } = require('../../utils/helpers'); // Assuming this is a shared helper

let mongoServer;
let app; // We'll create a mock express app for testing routes if needed, otherwise directly test controller functions

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
  app.post('/api/subscription/confirm-payment', (req, res, next) => {
    req.user = { _id: 'adminUserId123', isAdmin: true }; // Mock admin user for confirmPaymentForProPlus
    subscriptionController.confirmPaymentForProPlus(req, res, next);
  });
  app.post('/api/subscription/notify-payment', (req, res, next) => {
    req.user = { _id: 'userUserId456' }; // Mock regular user for notifyPaymentForProPlus
    subscriptionController.notifyPaymentForProPlus(req, res, next);
  });
  app.get('/api/subscription/pending-payments', (req, res, next) => {
    req.user = { _id: 'adminUserId123', isAdmin: true }; // Mock admin user for getPendingPayments
    subscriptionController.getPendingPayments(req, res, next);
  });
  app.get('/api/subscription/pro-plus-plan', subscriptionController.getProPlusPlan);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
  jest.clearAllMocks();
});

describe('SubscriptionController', () => {

  // Mock implementation for User.startSession() and session methods
  const mockSession = {
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    abortTransaction: jest.fn(),
    endSession: jest.fn(),
  };

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
    User.startSession.mockResolvedValue(mockSession);
    User.findById.mockReset(); // Clear any previous mock implementations
    validateProPlusPayment.mockReturnValue({ error: null }); // Default to no validation error
  });

  describe('confirmPaymentForProPlus (Admin Endpoint)', () => {
    it('should confirm Pro+ payment and activate subscription for a valid user', async () => {
      const mockUser = {
        _id: 'user123',
        subscription: {
          isProPlus: false,
          paymentStatus: 'pending',
          paymentEvidence: {
            transactionId: 'oldTxn123',
            screenshot: 'oldScreenshot.jpg',
            timestamp: new Date(),
          },
        },
        subscriptionHistory: [],
        save: jest.fn().mockResolvedValue(true),
      };

      User.findById.mockResolvedValue(mockUser);

      const res = await request(app)
        .post('/api/subscription/confirm-payment')
        .send({ userId: 'user123', transactionId: 'newTxn456' });

      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('success');
      expect(res.body.message).toEqual('Pro+ subscription activated');
      expect(mockUser.subscription.isProPlus).toBe(true);
      expect(mockUser.subscription.paymentStatus).toEqual('verified');
      expect(mockUser.subscriptionHistory.length).toBe(1);
      expect(mockUser.save).toHaveBeenCalled();
      expect(mockSession.commitTransaction).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        'Pro+ payment confirmed',
        expect.objectContaining({
          adminId: 'adminUserId123',
          userId: 'user123',
          transactionId: 'newTxn456',
        })
      );
    });

    it('should return 403 if not an admin', async () => {
      const res = await request(app)
        .post('/api/subscription/confirm-payment')
        .set('user', JSON.stringify({ _id: 'regularUser', isAdmin: false })) // Override req.user for this test
        .send({ userId: 'user123', transactionId: 'txn123' });

      expect(res.statusCode).toEqual(403);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('Admin privileges required');
      expect(mockSession.abortTransaction).not.toHaveBeenCalled();
    });

    it('should return 400 if validation fails', async () => {
      validateProPlusPayment.mockReturnValue({ error: { details: [{ message: 'Invalid input' }] } });

      const res = await request(app)
        .post('/api/subscription/confirm-payment')
        .send({ userId: 'user123' }); // Missing transactionId

      expect(res.statusCode).toEqual(400);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('Invalid input');
      expect(mockSession.abortTransaction).not.toHaveBeenCalled(); // No transaction started if validation fails early
    });

    it('should return 404 if user not found', async () => {
      User.findById.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/subscription/confirm-payment')
        .send({ userId: 'nonExistentUser', transactionId: 'txn123' });

      expect(res.statusCode).toEqual(404);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('User not found');
      expect(mockSession.abortTransaction).toHaveBeenCalled();
    });

    it('should return 409 if payment already verified', async () => {
      const mockUser = {
        _id: 'user123',
        subscription: {
          isProPlus: true,
          paymentStatus: 'verified',
        },
        save: jest.fn(),
      };
      User.findById.mockResolvedValue(mockUser);

      const res = await request(app)
        .post('/api/subscription/confirm-payment')
        .send({ userId: 'user123', transactionId: 'txn123' });

      expect(res.statusCode).toEqual(409);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('Payment already verified');
      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(mockUser.save).not.toHaveBeenCalled();
    });

    it('should handle internal server errors', async () => {
      User.findById.mockImplementation(() => {
        throw new Error('Database error');
      });

      const res = await request(app)
        .post('/api/subscription/confirm-payment')
        .send({ userId: 'user123', transactionId: 'txn123' });

      expect(res.statusCode).toEqual(500);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('Payment confirmation failed');
      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Payment confirmation failed: Database error'));
    });
  });

  describe('notifyPaymentForProPlus (User Endpoint)', () => {
    it('should successfully submit payment details for review', async () => {
      const mockUser = {
        _id: 'userUserId456',
        subscription: {
          isProPlus: false,
          paymentStatus: 'none',
          paymentEvidence: null,
        },
        save: jest.fn().mockResolvedValue(true),
      };
      User.findById.mockResolvedValue(mockUser);

      const res = await request(app)
        .post('/api/subscription/notify-payment')
        .send({ transactionId: 'userTxn123', screenshotUrl: 'http://example.com/screenshot.jpg' });

      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('success');
      expect(res.body.message).toEqual('Payment details submitted for review');
      expect(mockUser.subscription.paymentStatus).toEqual('pending');
      expect(mockUser.subscription.paymentEvidence.transactionId).toEqual('userTxn123');
      expect(mockUser.subscription.paymentEvidence.screenshot).toEqual('http://example.com/screenshot.jpg');
      expect(mockUser.save).toHaveBeenCalled();
      expect(mockSession.commitTransaction).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        'Payment notification received',
        expect.objectContaining({
          userId: 'userUserId456',
          transactionId: 'userTxn123',
        })
      );
    });

    it('should return 400 if transactionId or screenshotUrl is missing', async () => {
      const res = await request(app)
        .post('/api/subscription/notify-payment')
        .send({ transactionId: 'userTxn123' }); // Missing screenshotUrl

      expect(res.statusCode).toEqual(400);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('Transaction ID and proof required');
      expect(mockSession.abortTransaction).not.toHaveBeenCalled();
    });

    it('should return 409 if Pro+ subscription is already active', async () => {
      const mockUser = {
        _id: 'userUserId456',
        subscription: {
          isProPlus: true,
          paymentStatus: 'verified',
        },
        save: jest.fn(),
      };
      User.findById.mockResolvedValue(mockUser);

      const res = await request(app)
        .post('/api/subscription/notify-payment')
        .send({ transactionId: 'userTxn123', screenshotUrl: 'http://example.com/screenshot.jpg' });

      expect(res.statusCode).toEqual(409);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('Pro+ subscription already active');
      expect(mockSession.abortTransaction).not.toHaveBeenCalled(); // No transaction started because of early exit
    });

    it('should handle internal server errors', async () => {
      User.findById.mockImplementation(() => {
        throw new Error('Database error');
      });

      const res = await request(app)
        .post('/api/subscription/notify-payment')
        .send({ transactionId: 'userTxn123', screenshotUrl: 'http://example.com/screenshot.jpg' });

      expect(res.statusCode).toEqual(500);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('Payment notification failed');
      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Payment notification failed: Database error'));
    });
  });

  describe('getPendingPayments (Admin Endpoint)', () => {
    it('should return a list of users with pending payments if admin', async () => {
      const mockPendingUsers = [
        {
          _id: 'userA',
          email: 'userA@example.com',
          subscription: {
            paymentEvidence: { transactionId: 'txnA', screenshot: 'ssA.jpg' }
          }
        },
        {
          _id: 'userB',
          email: 'userB@example.com',
          subscription: {
            paymentEvidence: { transactionId: 'txnB', screenshot: 'ssB.jpg' }
          }
        },
      ];
      User.find.mockResolvedValue(mockPendingUsers);

      const res = await request(app)
        .get('/api/subscription/pending-payments');

      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('success');
      expect(res.body.message).toEqual('Pending payments retrieved');
      expect(res.body.data).toEqual(mockPendingUsers);
      expect(User.find).toHaveBeenCalledWith({ 'subscription.paymentStatus': 'pending' });
      expect(User.find).toHaveBeenCalledWith({}, expect.objectContaining({ select: 'email subscription.paymentEvidence' }));
    });

    it('should return 403 if not an admin', async () => {
      const res = await request(app)
        .get('/api/subscription/pending-payments')
        .set('user', JSON.stringify({ _id: 'regularUser', isAdmin: false })); // Override req.user for this test

      expect(res.statusCode).toEqual(403);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('Admin access required');
      expect(User.find).not.toHaveBeenCalled();
    });

    it('should handle internal server errors', async () => {
      User.find.mockImplementation(() => {
        throw new Error('Database error');
      });

      const res = await request(app)
        .get('/api/subscription/pending-payments');

      expect(res.statusCode).toEqual(500);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('Failed to retrieve pending payments');
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Pending payments fetch failed: Database error'));
    });
  });

  describe('getProPlusPlan', () => {
    it('should return Pro+ plan details successfully', async () => {
      const expectedPlanDetails = {
        name: 'Pro+',
        price: 299.99,
        currency: 'USD',
        features: ['Advanced charting tools', 'Unlimited account balance', 'LNF', 'Faster execution speed of up to 15ms', 'Higher trading limits', 'Access to our top end Trading Bots', 'secure transactions with wallet tracking', 'Dedicated support'],
        paymentWallets: expect.any(Object), // We can check specific wallets if needed
        paymentInstructions: expect.any(String),
      };

      const res = await request(app).get('/api/subscription/pro-plus-plan');

      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('success');
      expect(res.body.message).toEqual('Pro+ plan details retrieved successfully');
      expect(res.body.data).toEqual(expect.objectContaining(expectedPlanDetails));
      expect(res.body.data.paymentWallets.BTC).toEqual('bc1qrhmqgnwml62udh5c5wnyukx65rdtqdsa58p54l');
    });

    it('should handle internal server errors', async () => {
      // Mocking console.error to avoid test output noise for expected error
      const originalConsoleError = console.error;
      console.error = jest.fn();

      // Temporarily break something in the controller to trigger the catch block
      const originalProPlusPaymentDetails = subscriptionController.proPlusPaymentDetails;
      Object.defineProperty(subscriptionController, 'proPlusPaymentDetails', {
        get: () => { throw new Error('Simulated internal error'); }
      });

      const res = await request(app).get('/api/subscription/pro-plus-plan');

      expect(res.statusCode).toEqual(500);
      expect(res.body.status).toEqual('error');
      expect(res.body.message).toEqual('Server error fetching Pro+ plan details');
      expect(res.body.data.error).toEqual('Simulated internal error');

      // Restore original console.error and proPlusPaymentDetails
      console.error = originalConsoleError;
      Object.defineProperty(subscriptionController, 'proPlusPaymentDetails', {
        value: originalProPlusPaymentDetails
      });
    });
  });
});
