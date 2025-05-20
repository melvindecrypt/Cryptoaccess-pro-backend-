const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server'); // For in-memory MongoDB
const app = require('../app'); // Assuming your app.js exports the Express app
const User = require('../models/User');
const Investment = require('../models/Investment');
const InvestmentPlan = require('../models/InvestmentPlan');
const Wallet = require('../models/Wallet');
const { formatResponse } = require('../utils/helpers'); // Assuming this is correct path
const logger = require('../utils/logger');
const Decimal = require('decimal.js');

// Mock external dependencies
jest.mock('../utils/logger');
jest.mock('../utils/helpers', () => ({
    formatResponse: jest.fn((success, message, data) => ({ success, message, data })),
}));

// Mock the calculateEndDate function for consistent test results
const investmentController = require('../controllers/investmentController'); // Get the actual controller
jest.spyOn(investmentController, 'calculateEndDate').mockReturnValue(new Date('2026-05-20T00:00:00.000Z'));

let mongoServer;
let uri;

// Dummy data for testing
let testUser, testPlan, testWallet;

// Setup before all tests
beforeAll(async () => {
    // Start in-memory MongoDB server
    mongoServer = await MongoMemoryServer.create();
    uri = mongoServer.getUri();
    await mongoose.connect(uri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
    });

    // Create a dummy user, investment plan, and wallet for testing
    testUser = await User.create({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        password: 'password123', // Hashed in real app, but for test, simple
        isEmailVerified: true,
        kycStatus: 'approved'
    });

    testPlan = await InvestmentPlan.create({
        name: 'Gold Plan',
        minAmount: 100,
        maxAmount: 10000,
        roi: 0.05, // 5%
        duration: '12 months',
        status: 'available',
    });

    testWallet = await Wallet.create({
        userId: testUser._id,
        balances: {
            USD: 5000,
            BTC: 0.1
        }
    });

    // Mock authentication middleware if your routes are protected.
    // This is a simplified mock. In a real scenario, you'd mock your JWT middleware.
    app.use((req, res, next) => {
        req.user = testUser; // Attach a dummy user to req.user for authenticated routes
        next();
    });
});

// Cleanup after all tests
afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

// Clear data after each test to ensure isolation
afterEach(async () => {
    await Investment.deleteMany({});
    // Reset wallet balance for each test if it's modified
    await Wallet.updateOne({ userId: testUser._id }, { $set: { 'balances.USD': 5000 } });
    jest.clearAllMocks(); // Clear mock call history after each test
});

describe('InvestmentController', () => {

    describe('viewPlans', () => {
        test('should return available investment plans', async () => {
            const res = await request(app).get('/api/investments/plans'); // Adjust API path as needed

            expect(res.statusCode).toEqual(200);
            expect(formatResponse).toHaveBeenCalledWith(true, 'Investment plans fetched successfully', expect.any(Object));
            expect(res.body.data.plans).toBeInstanceOf(Array);
            expect(res.body.data.plans.length).toBeGreaterThan(0);
            expect(res.body.data.plans[0]).toHaveProperty('id');
            expect(res.body.data.plans[0]).toHaveProperty('name');
            expect(res.body.data.plans[0]).toHaveProperty('minAmount');
        });

        test('should handle errors when fetching plans', async () => {
            // Temporarily mock InvestmentPlan.find to throw an error
            jest.spyOn(InvestmentPlan, 'find').mockImplementationOnce(() => {
                throw new Error('Database error');
            });

            const res = await request(app).get('/api/investments/plans');

            expect(res.statusCode).toEqual(500);
            expect(formatResponse).toHaveBeenCalledWith(false, 'Error fetching investment plans', expect.any(Object));
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error fetching plans: Database error'));
        });
    });

    describe('invest', () => {
        test('should successfully create an investment and update wallet balance', async () => {
            const initialBalance = testWallet.balances.USD;
            const investmentAmount = 500;

            const res = await request(app)
                .post('/api/investments/invest') // Adjust API path as needed
                .send({
                    planId: testPlan._id.toString(),
                    amount: investmentAmount,
                });

            expect(res.statusCode).toEqual(201);
            expect(formatResponse).toHaveBeenCalledWith(true, 'Investment started successfully', expect.any(Object));
            expect(res.body.data).toHaveProperty('investmentId');
            expect(res.body.data.amount).toEqual(investmentAmount);
            expect(res.body.data.status).toEqual('active');

            // Verify wallet balance updated
            const updatedWallet = await Wallet.findById(testWallet._id);
            expect(updatedWallet.balances.USD).toEqual(initialBalance - investmentAmount);

            // Verify investment record created
            const investment = await Investment.findOne({ userId: testUser._id });
            expect(investment).not.toBeNull();
            expect(investment.amountInvested).toEqual(investmentAmount);
            expect(investment.planId.toString()).toEqual(testPlan._id.toString());
        });

        test('should return 400 for invalid planId or amount', async () => {
            const res = await request(app)
                .post('/api/investments/invest')
                .send({
                    planId: 'invalidId',
                    amount: 0,
                });

            expect(res.statusCode).toEqual(400);
            expect(formatResponse).toHaveBeenCalledWith(false, 'Valid plan ID and amount required', expect.any(Object));
        });

        test('should return 404 if user not found', async () => {
            // Temporarily mock User.findById to return null
            jest.spyOn(User, 'findById').mockResolvedValueOnce(null);

            const res = await request(app)
                .post('/api/investments/invest')
                .send({
                    planId: testPlan._id.toString(),
                    amount: 100,
                });

            expect(res.statusCode).toEqual(404);
            expect(formatResponse).toHaveBeenCalledWith(false, 'User not found', expect.any(Object));
        });

        test('should return 404 if investment plan not found', async () => {
            // Temporarily mock InvestmentPlan.findById to return null
            jest.spyOn(InvestmentPlan, 'findById').mockResolvedValueOnce(null);

            const res = await request(app)
                .post('/api/investments/invest')
                .send({
                    planId: new mongoose.Types.ObjectId().toString(), // Use a new valid-looking ID
                    amount: 100,
                });

            expect(res.statusCode).toEqual(404);
            expect(formatResponse).toHaveBeenCalledWith(false, 'Investment plan not found', expect.any(Object));
        });

        test('should return 400 if amount is less than minAmount', async () => {
            const res = await request(app)
                .post('/api/investments/invest')
                .send({
                    planId: testPlan._id.toString(),
                    amount: testPlan.minAmount - 1, // Amount less than min
                });

            expect(res.statusCode).toEqual(400);
            expect(formatResponse).toHaveBeenCalledWith(false, `Amount must be at least ${testPlan.minAmount}`, expect.any(Object));
        });

        test('should return 404 if user wallet not found', async () => {
            // Temporarily mock Wallet.findOne to return null
            jest.spyOn(Wallet, 'findOne').mockResolvedValueOnce(null);

            const res = await request(app)
                .post('/api/investments/invest')
                .send({
                    planId: testPlan._id.toString(),
                    amount: 100,
                });

            expect(res.statusCode).toEqual(404);
            expect(formatResponse).toHaveBeenCalledWith(false, 'User wallet not found', expect.any(Object));
        });

        test('should return 402 for insufficient balance', async () => {
            const res = await request(app)
                .post('/api/investments/invest')
                .send({
                    planId: testPlan._id.toString(),
                    amount: testWallet.balances.USD + 100, // Amount more than balance
                });

            expect(res.statusCode).toEqual(402);
            expect(formatResponse).toHaveBeenCalledWith(false, 'Insufficient USD balance', expect.any(Object));
        });

        test('should roll back transaction on error during save', async () => {
            const initialBalance = testWallet.balances.USD;
            const investmentAmount = 500;

            // Mock Wallet.save to throw an error
            jest.spyOn(Wallet.prototype, 'save').mockImplementationOnce(function () {
                throw new Error('Wallet save error');
            });

            const res = await request(app)
                .post('/api/investments/invest')
                .send({
                    planId: testPlan._id.toString(),
                    amount: investmentAmount,
                });

            expect(res.statusCode).toEqual(500);
            expect(formatResponse).toHaveBeenCalledWith(false, 'Error processing investment transaction', expect.any(Object));
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Investment transaction error: Wallet save error'));

            // Verify wallet balance is NOT updated (rollback)
            const updatedWallet = await Wallet.findById(testWallet._id);
            expect(updatedWallet.balances.USD).toEqual(initialBalance);

            // Verify investment record is NOT created (rollback)
            const investment = await Investment.findOne({ userId: testUser._id });
            expect(investment).toBeNull();
        });
    });

    describe('getInvestmentDetails', () => {
        let activeInvestment;

        beforeEach(async () => {
            activeInvestment = await Investment.create({
                userId: testUser._id,
                planId: testPlan._id,
                amountInvested: 750,
                status: 'active',
                createdAt: new Date('2025-05-20T00:00:00.000Z') // Specific date for calculateEndDate
            });
        });

        test('should return details for an existing investment', async () => {
            const res = await request(app).get(`/api/investments/${activeInvestment._id.toString()}`); // Adjust API path

            expect(res.statusCode).toEqual(200);
            expect(res.body.success).toEqual(true);
            expect(res.body.investment).toHaveProperty('_id', activeInvestment._id.toString());
            expect(res.body.investment).toHaveProperty('amount', activeInvestment.amountInvested);
            expect(res.body.investment).toHaveProperty('plan', testPlan.name);
            expect(res.body.investment).toHaveProperty('status', 'active');
            expect(res.body.investment).toHaveProperty('endDate', '2026-05-20T00:00:00.000Z'); // Mocked end date
        });

        test('should return 404 if investment not found', async () => {
            const nonExistentId = new mongoose.Types.ObjectId();
            const res = await request(app).get(`/api/investments/${nonExistentId.toString()}`);

            expect(res.statusCode).toEqual(404);
            expect(res.body.success).toEqual(false);
            expect(res.body.message).toEqual('Investment not found');
        });

        test('should return 500 for server error', async () => {
            // Temporarily mock Investment.findOne to throw an error
            jest.spyOn(Investment, 'findOne').mockImplementationOnce(() => {
                throw new Error('DB connection error');
            });

            const res = await request(app).get(`/api/investments/${activeInvestment._id.toString()}`);

            expect(res.statusCode).toEqual(500);
            expect(res.body.success).toEqual(false);
            expect(res.body.message).toEqual('Server error');
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error fetching investment details: DB connection error'));
        });
    });

    describe('cancelInvestment', () => {
        let activeInvestmentToCancel;
        let completedInvestment;

        beforeEach(async () => {
            activeInvestmentToCancel = await Investment.create({
                userId: testUser._id,
                planId: testPlan._id,
                amountInvested: 200,
                status: 'active',
            });
            completedInvestment = await Investment.create({
                userId: testUser._id,
                planId: testPlan._id,
                amountInvested: 150,
                status: 'matured', // Example of a non-active status
            });
        });

        test('should successfully cancel an active investment', async () => {
            const res = await request(app).put(`/api/investments/cancel/${activeInvestmentToCancel._id.toString()}`); // Adjust API path

            expect(res.statusCode).toEqual(200);
            expect(res.body.success).toEqual(true);
            expect(res.body.message).toEqual('Investment cancelled');
            expect(res.body.investment.status).toEqual('cancelled');

            // Verify status in DB
            const updatedInvestment = await Investment.findById(activeInvestmentToCancel._id);
            expect(updatedInvestment.status).toEqual('cancelled');

            // IMPORTANT: If cancellation implies a refund, add assertions for wallet balance here.
            // This test assumes no refund on cancellation as per current code.
        });

        test('should return 404 if investment not found for cancellation', async () => {
            const nonExistentId = new mongoose.Types.ObjectId();
            const res = await request(app).put(`/api/investments/cancel/${nonExistentId.toString()}`);

            expect(res.statusCode).toEqual(404);
            expect(res.body.success).toEqual(false);
            expect(res.body.message).toEqual('Investment not found');
        });

        test('should return 400 if investment is not active', async () => {
            const res = await request(app).put(`/api/investments/cancel/${completedInvestment._id.toString()}`);

            expect(res.statusCode).toEqual(400);
            expect(res.body.success).toEqual(false);
            expect(res.body.message).toEqual('Only active investments can be cancelled');
        });

        test('should return 500 for server error during cancellation', async () => {
            // Temporarily mock Investment.findOne to throw an error
            jest.spyOn(Investment, 'findOne').mockImplementationOnce(() => {
                throw new Error('Cancellation DB error');
            });

            const res = await request(app).put(`/api/investments/cancel/${activeInvestmentToCancel._id.toString()}`);

            expect(res.statusCode).toEqual(500);
            expect(res.body.success).toEqual(false);
            expect(res.body.message).toEqual('Server error');
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error cancelling investment: Cancellation DB error'));
        });
    });
});
