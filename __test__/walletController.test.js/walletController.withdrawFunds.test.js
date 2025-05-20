const walletController = require('../../controllers/WalletController');
const Wallet = require('../../models/Wallet');
const User = require('../../models/User');
const Currency = require('../../models/Currency'); // For validateCurrency
const { formatResponse } = require('../../utils/helpers');
const logger = require('../../utils/logger');
const Decimal = require('decimal.js');
const mongoose = require('mongoose');

// Mock external modules
jest.mock('../../models/Wallet');
jest.mock('../../models/User');
jest.mock('../../models/Currency'); // For validateCurrency
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


describe('walletController.withdrawFunds', () => {
    let req, res;
    let mockUser, mockWallet;

    beforeEach(() => {
        jest.clearAllMocks();

        mockUser = {
            _id: 'userId123',
            isProPlus: true,
            kycStatus: 'VERIFIED',
        };
        User.findById.mockResolvedValue(mockUser);

        mockWallet = {
            userId: 'userId123',
            balances: new Map([['BTC', 10], ['ETH', 5]]), // Use Map for .get()
            transactions: [],
            save: jest.fn().mockResolvedValue(true),
        };
        Wallet.findOne.mockResolvedValue(mockWallet);

        // Mock Currency.findOne for validateCurrency
        Currency.findOne.mockResolvedValue({ symbol: 'BTC', isActive: true });

        req = {
            user: { _id: 'userId123' },
            body: {
                currency: 'BTC',
                amount: 1,
                destinationAddress: 'test_btc_address',
            },
        };
        res = {
            json: jest.fn(),
            status: jest.fn().mockReturnThis(),
        };

        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    // --- TEST SUITE: VALIDATION AND PRE-CONDITIONS ---
    describe('Validation and Pre-conditions', () => {
        test('should return 400 if currency is unsupported', async () => {
            req.body.currency = 'XYZ';
            Currency.findOne.mockResolvedValue(null); // Simulate validateCurrency throwing error

            await walletController.withdrawFunds(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, 'Unsupported currency: XYZ'));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
        });

        test('should return 400 if destination address is missing', async () => {
            req.body.destinationAddress = undefined;
            await walletController.withdrawFunds(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, 'Destination address required'));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
        });

        test('should return 400 if user is not Pro+ and KYC is not VERIFIED', async () => {
            mockUser.isProPlus = false;
            mockUser.kycStatus = 'PENDING';
            await walletController.withdrawFunds(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, 'Pro+ subscription and KYC verification required'));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
        });

        test('should return 400 if user is Pro+ but KYC is not VERIFIED', async () => {
            mockUser.isProPlus = true;
            mockUser.kycStatus = 'PENDING';
            await walletController.withdrawFunds(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, 'Pro+ subscription and KYC verification required'));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
        });

        test('should return 400 if user is not Pro+ but KYC is VERIFIED', async () => {
            mockUser.isProPlus = false;
            mockUser.kycStatus = 'VERIFIED';
            await walletController.withdrawFunds(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, 'Pro+ subscription and KYC verification required'));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
        });

        test('should return 400 if insufficient balance', async () => {
            req.body.amount = 15; // User only has 10 BTC
            await walletController.withdrawFunds(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, 'Insufficient BTC balance'));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
        });

        test('should return 400 if wallet not found for user', async () => {
            Wallet.findOne.mockResolvedValue(null);
            await walletController.withdrawFunds(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, 'Cannot read properties of null (reading \'balances\')')); // Error from `wallet.balances.get(currency)`
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
        });

        test('should return 400 if user not found', async () => {
            User.findById.mockResolvedValue(null);
            await walletController.withdrawFunds(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, "Cannot read properties of null (reading 'isProPlus')"));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
        });

        test('should return 400 if amount is zero or negative', async () => {
            req.body.amount = 0;
            await walletController.withdrawFunds(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, 'Insufficient BTC balance')); // If balance is not set to 0, it will fall into insufficient balance
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();

            req.body.amount = -5;
            res.status.mockClear();
            res.json.mockClear();
            mockSession.abortTransaction.mockClear();
            mockSession.endSession.mockClear();

            await walletController.withdrawFunds(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, 'Insufficient BTC balance'));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
        });
    });

    // --- TEST SUITE: SUCCESSFUL WITHDRAWAL ---
    describe('Successful Withdrawal', () => {
        test('should process withdrawal, update balance, record transaction and commit', async () => {
            const initialBtcBalance = mockWallet.balances.get('BTC'); // 10
            const withdrawalAmount = req.body.amount; // 1

            await walletController.withdrawFunds(req, res);

            // Assertions for transaction
            expect(mongoose.startSession).toHaveBeenCalled();
            expect(mockSession.startTransaction).toHaveBeenCalled();

            // Assertions for fetches
            expect(User.findById).toHaveBeenCalledWith(req.user._id);
            expect(Wallet.findOne).toHaveBeenCalledWith({ userId: mockUser._id });
            expect(Currency.findOne).toHaveBeenCalledWith({ symbol: 'BTC', isActive: true });

            // Assertions for balance update
            expect(mockWallet.balances.get('BTC')).toBe(initialBtcBalance - withdrawalAmount); // 9
            expect(mockWallet.transactions.length).toBe(1);
            expect(mockWallet.transactions[0]).toMatchObject({
                type: 'withdrawal',
                currency: 'BTC',
                amount: withdrawalAmount,
                destinationAddress: 'test_btc_address',
                status: 'PENDING',
                networkFee: 0.0005,
                timestamp: expect.any(Date),
            });
            expect(mockWallet.save).toHaveBeenCalledWith({ session: mockSession });

            // Assertions for transaction commit and session end
            expect(mockSession.commitTransaction).toHaveBeenCalled();
            expect(mockSession.abortTransaction).not.toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();

            // Assertions for response
            expect(res.status).not.toHaveBeenCalled(); // Default 200
            expect(res.json).toHaveBeenCalledWith(
                formatResponse(true, 'Withdrawal request received', {
                    processingTime: '1-3 business days',
                    transactionFee: 0.0005,
                })
            );
            expect(logger.error).not.toHaveBeenCalled();
        });
    });

    // --- TEST SUITE: ERROR HANDLING & TRANSACTION ROLLBACK ---
    describe('Error Handling and Transaction Rollback', () => {
        test('should abort transaction and return 400 if user.save fails', async () => {
            const saveError = new Error('Wallet save failed');
            mockWallet.save.mockRejectedValue(saveError);

            await walletController.withdrawFunds(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, saveError.message));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
            expect(mockSession.commitTransaction).not.toHaveBeenCalled();
            expect(logger.error).toHaveBeenCalledWith(`Withdrawal failed: ${saveError.message}`);
        });

        test('should abort transaction and return 400 for any unexpected error', async () => {
            const generalError = new Error('Unexpected issue during withdrawal');
            User.findById.mockRejectedValue(generalError); // Simulate early error

            await walletController.withdrawFunds(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, generalError.message));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
            expect(mockSession.commitTransaction).not.toHaveBeenCalled();
            expect(logger.error).toHaveBeenCalledWith(`Withdrawal failed: ${generalError.message}`);
        });
    });
});
