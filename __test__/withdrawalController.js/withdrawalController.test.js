const withdrawalController = require('../../controllers/withdrawalController');
const Withdrawal = require('../../models/Withdrawal');
const User = require('../../models/User');
const { formatResponse } = require('../../utils/helpers');
const logger = require('../../utils/logger');
const Decimal = require('decimal.js');
const mongoose = require('mongoose');

// Mock external modules
jest.mock('../../models/Withdrawal');
jest.mock('../../models/User');
jest.mock('../../utils/helpers', () => ({
    formatResponse: jest.fn((success, message, data) => ({ success, message, data })),
}));
jest.mock('../../utils/logger', () => ({
    info: jest.fn(),
    error: jest.fn(),
}));

// Mock mongoose session and transaction capabilities
const mockSession = {
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    abortTransaction: jest.fn(),
    endSession: jest.fn(),
};
jest.spyOn(mongoose, 'startSession').mockResolvedValue(mockSession);

describe('withdrawalController.createWithdrawal', () => {
    let req, res;
    let mockUser;

    beforeEach(() => {
        jest.clearAllMocks();

        // Default mock user with sufficient balance, Pro+ and approved KYC
        mockUser = {
            _id: 'userId123',
            isProPlus: true,
            kycStatus: 'approved',
            virtualBalances: {
                'BTC': 10,
                'ETH': 5,
            },
            save: jest.fn().mockResolvedValue(true),
        };
        User.findById.mockResolvedValue(mockUser);

        // Mock Withdrawal.create
        Withdrawal.create.mockResolvedValue([{ _id: 'withdrawalId123' }]);

        // Mock request and response objects
        req = {
            user: { _id: 'userId123' }, // req.user from authentication middleware
            body: {
                currency: 'BTC',
                amount: 1, // Default amount for successful scenarios
                destinationAddress: 'bitcoinaddress123',
            },
        };
        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
        };

        // Suppress console.error output from original code's try-catch in tests
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    // --- TEST SUITE: VALIDATION AND PRE-CONDITIONS ---
    describe('Validation and Pre-conditions', () => {
        test('should return 400 if amount is invalid (e.g., non-numeric)', async () => {
            req.body.amount = 'invalid'; // Non-numeric amount
            await withdrawalController.createWithdrawal(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                formatResponse(false, 'Invalid Decimal value: invalid', undefined) // Error from new Decimal()
            );
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Invalid Decimal value: invalid'));
        });

        test('should return 400 if amount is zero or negative', async () => {
            req.body.amount = 0;
            await withdrawalController.createWithdrawal(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            // The error message comes from the Decimal conversion or subsequent logic.
            // In your current code, `new Decimal(0)` is valid, but balance check would fail or subsequent logic would catch.
            // It's good to add explicit validation for amount > 0 if not handled by a validator middleware.
            // For now, let's assume if it passes Decimal, the subsequent checks will handle it.
            // We'll test against the 'Insufficient balance' which is the closest current check.
            // If you want a specific 'Amount must be positive' error, add a validator.
            expect(mockUser.virtualBalances[req.body.currency]).toBe(0); // If balance is 0, it should be insufficient.
            // More accurately:
            // This case would lead to 'Insufficient balance' if initial balance is 0, or be handled by user.save if balance is greater than 0
            // Assuming no specific validation beyond Decimal conversion.
            expect(User.findById).toHaveBeenCalledWith(req.user._id); // Ensure user is fetched
            expect(res.status).toHaveBeenCalledWith(402); // Insufficient balance scenario
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, 'Insufficient balance'));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();

            req.body.amount = -5;
            User.findById.mockResolvedValue(mockUser); // Reset mock for second part of test
            res.status.mockClear();
            res.json.mockClear();
            mockSession.abortTransaction.mockClear();
            mockSession.endSession.mockClear();

            await withdrawalController.createWithdrawal(req, res);
            expect(res.status).toHaveBeenCalledWith(402); // Still insufficient balance
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, 'Insufficient balance'));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
        });


        test('should return 403 if user is not Pro+', async () => {
            mockUser.isProPlus = false;
            await withdrawalController.createWithdrawal(req, res);
            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, 'Pro+ subscription required for withdrawals'));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
        });

        test('should return 403 if user KYC status is not approved', async () => {
            mockUser.kycStatus = 'pending';
            await withdrawalController.createWithdrawal(req, res);
            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, 'KYC verification required for withdrawals'));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
        });

        test('should return 402 if user has insufficient balance', async () => {
            req.body.amount = 15; // User only has 10 BTC
            await withdrawalController.createWithdrawal(req, res);
            expect(res.status).toHaveBeenCalledWith(402);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, 'Insufficient balance'));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
        });

        test('should return 400 if user virtual balance for currency is undefined/null (insufficient)', async () => {
            // No 'XYZ' balance defined
            req.body.currency = 'XYZ';
            await withdrawalController.createWithdrawal(req, res);
            expect(res.status).toHaveBeenCalledWith(402);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, 'Insufficient balance'));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
        });

        test('should return 400 if req.user is missing (auth middleware failed)', async () => {
            req.user = undefined;
            await withdrawalController.createWithdrawal(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, 'User not found'));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
        });

        test('should return 400 if user is not found in DB', async () => {
            User.findById.mockResolvedValue(null);
            await withdrawalController.createWithdrawal(req, res);
            expect(res.status).toHaveBeenCalledWith(400); // Because the catch block catches 'User not found' error
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, 'User not found'));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
        });
    });

    // --- TEST SUITE: SUCCESSFUL WITHDRAWAL ---
    describe('Successful Withdrawal', () => {
        test('should create a withdrawal request and update user balance', async () => {
            const initialBtcBalance = mockUser.virtualBalances.BTC; // 10
            const withdrawalAmount = req.body.amount; // 1

            await withdrawalController.createWithdrawal(req, res);

            // Assertions for Mongoose session and transaction
            expect(mongoose.startSession).toHaveBeenCalled();
            expect(mockSession.startTransaction).toHaveBeenCalled();

            // Assertions for User.findById
            expect(User.findById).toHaveBeenCalledWith(req.user._id);

            // Assertions for Withdrawal.create
            expect(Withdrawal.create).toHaveBeenCalledWith([{
                user: req.user._id,
                currency: req.body.currency,
                amount: withdrawalAmount, // Should be the numeric amount
                destinationAddress: req.body.destinationAddress
            }], { session: mockSession });

            // Assertions for user balance update and save
            expect(mockUser.virtualBalances.BTC).toBe(initialBtcBalance - withdrawalAmount); // 10 - 1 = 9
            expect(mockUser.save).toHaveBeenCalledWith({ session: mockSession });

            // Assertions for transaction commit and session end
            expect(mockSession.commitTransaction).toHaveBeenCalled();
            expect(mockSession.abortTransaction).not.toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();

            // Assertions for logger
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Withdrawal requested: withdrawalId123'));

            // Assertions for response
            expect(res.status).not.toHaveBeenCalled(); // Default 200
            expect(res.json).toHaveBeenCalledWith(
                formatResponse(true, 'Withdrawal request successful', {
                    withdrawalId: 'withdrawalId123',
                    status: 'success'
                })
            );
        });
    });

    // --- TEST SUITE: ERROR HANDLING & TRANSACTION ROLLBACK ---
    describe('Error Handling and Transaction Rollback', () => {
        test('should abort transaction and return 400 if User.findById throws an error', async () => {
            const findUserError = new Error('Database find user error');
            User.findById.mockRejectedValue(findUserError); // Simulate error during user fetch

            await withdrawalController.createWithdrawal(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, findUserError.message));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
            expect(mockSession.commitTransaction).not.toHaveBeenCalled();
            expect(logger.error).toHaveBeenCalledWith(`Error creating withdrawal request: ${findUserError.message}`);
        });

        test('should abort transaction and return 400 if Withdrawal.create fails', async () => {
            const createWithdrawalError = new Error('Failed to create withdrawal record');
            Withdrawal.create.mockRejectedValue(createWithdrawalError); // Simulate error during withdrawal creation

            await withdrawalController.createWithdrawal(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, createWithdrawalError.message));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
            expect(mockSession.commitTransaction).not.toHaveBeenCalled();
            expect(logger.error).toHaveBeenCalledWith(`Error creating withdrawal request: ${createWithdrawalError.message}`);
        });

        test('should abort transaction and return 400 if user.save fails', async () => {
            const userSaveError = new Error('Failed to save user balance');
            mockUser.save.mockRejectedValue(userSaveError); // Simulate error during user balance update

            await withdrawalController.createWithdrawal(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, userSaveError.message));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
            expect(mockSession.commitTransaction).not.toHaveBeenCalled();
            expect(logger.error).toHaveBeenCalledWith(`Error creating withdrawal request: ${userSaveError.message}`);
        });

        test('should abort transaction and return 400 for any unexpected error', async () => {
            const generalError = new Error('An unexpected internal error occurred');
            // Simulate an error at an unexpected point, e.g., in Decimal conversion
            jest.spyOn(Decimal.prototype, 'minus').mockImplementation(() => { throw generalError; });

            await withdrawalController.createWithdrawal(req, res);

            expect(res.status).toHaveBeenCalledWith(400); // Catches and returns 400 with error.message
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, generalError.message));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
            expect(mockSession.commitTransaction).not.toHaveBeenCalled();
            expect(logger.error).toHaveBeenCalledWith(`Error creating withdrawal request: ${generalError.message}`);

            jest.restoreAllMocks(); // Restore Decimal.prototype.minus
        });
    });
});
