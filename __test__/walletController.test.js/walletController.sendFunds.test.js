const walletController = require('../../controllers/WalletController');
const Wallet = require('../../models/Wallet');
const User = require('../../models/User');
const Currency = require('../../models/Currency'); // For validateCurrency
const Transaction = require('../../models/Transaction'); // Assuming a Transaction model for separate records
const { formatResponse } = require('../../utils/helpers');
const logger = require('../../utils/logger');
const Decimal = require('decimal.js');
const mongoose = require('mongoose');

// Mock external modules
jest.mock('../../models/Wallet');
jest.mock('../../models/User');
jest.mock('../../models/Currency'); // For validateCurrency
jest.mock('../../models/Transaction'); // Assuming you have this model
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

describe('walletController.sendFunds (Internal Transfer)', () => {
    let req, res;
    let mockSenderUser, mockRecipientUser;
    let mockSenderWallet, mockRecipientWallet;

    beforeEach(() => {
        jest.clearAllMocks();

        mockSenderUser = { _id: 'senderUserId123', username: 'senderUser', email: 'sender@example.com' };
        mockRecipientUser = { _id: 'recipientUserId456', username: 'recipientUser', email: 'recipient@example.com' };

        mockSenderWallet = {
            userId: 'senderUserId123',
            _id: 'senderWalletId',
            balances: new Map([['BTC', 10], ['ETH', 5]]),
            save: jest.fn().mockResolvedValue(true),
        };
        mockRecipientWallet = {
            userId: 'recipientUserId456',
            _id: 'recipientWalletId',
            balances: new Map([['BTC', 2], ['ETH', 3]]),
            save: jest.fn().mockResolvedValue(true),
        };

        // Mock User.findOne for sender (if needed) and recipient lookup
        User.findOne
            .mockResolvedValueOnce(mockRecipientUser); // First call for recipient lookup

        // Mock Wallet.findOne for sender and recipient wallet lookup
        Wallet.findOne
            .mockResolvedValueOnce(mockSenderWallet) // First call for sender wallet
            .mockResolvedValueOnce(mockRecipientWallet); // Second call for recipient wallet

        // Mock Currency.findOne for validateCurrency
        Currency.findOne.mockResolvedValue({ symbol: 'BTC', isActive: true });

        // Mock Transaction.create
        Transaction.create.mockResolvedValue(true);

        req = {
            user: { _id: 'senderUserId123' }, // Authenticated sender
            body: {
                currency: 'BTC',
                amount: 1,
                recipientIdentifier: 'recipientUser', // Or email 'recipient@example.com'
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

            await walletController.sendFunds(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, 'Unsupported currency: XYZ'));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
        });

        test('should return 400 if recipient identifier is missing', async () => {
            req.body.recipientIdentifier = undefined;
            await walletController.sendFunds(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, 'Recipient identifier is required'));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
        });

        test('should return 400 if amount is zero', async () => {
            req.body.amount = 0;
            await walletController.sendFunds(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, 'Amount must be positive'));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
        });

        test('should return 400 if amount is negative', async () => {
            req.body.amount = -5;
            await walletController.sendFunds(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, 'Amount must be positive'));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
        });

        test('should return 400 if sender wallet not found', async () => {
            Wallet.findOne
                .mockResolvedValueOnce(null) // Sender wallet not found
                .mockResolvedValueOnce(mockRecipientWallet); // Still mock recipient wallet for subsequent checks

            await walletController.sendFunds(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, 'Sender wallet not found'));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
        });

        test('should return 400 if insufficient sender balance', async () => {
            req.body.amount = 15; // Sender only has 10 BTC
            await walletController.sendFunds(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, 'Insufficient BTC balance'));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
        });

        test('should return 400 if recipient not found', async () => {
            User.findOne.mockResolvedValueOnce(null); // Recipient not found
            // Ensure Wallet.findOne is reset for next calls if needed for the test to pass
            Wallet.findOne
                .mockResolvedValueOnce(mockSenderWallet)
                .mockResolvedValueOnce(mockRecipientWallet);

            await walletController.sendFunds(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, 'Recipient not found or cannot send to yourself'));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
        });

        test('should return 400 if sending to self', async () => {
            User.findOne.mockResolvedValueOnce(mockSenderUser); // Recipient is the sender themselves
            // Ensure Wallet.findOne is reset for next calls
            Wallet.findOne
                .mockResolvedValueOnce(mockSenderWallet)
                .mockResolvedValueOnce(mockRecipientWallet); // Still mock recipient wallet for subsequent checks

            await walletController.sendFunds(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, 'Recipient not found or cannot send to yourself'));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
        });


        test('should return 400 if recipient wallet not found', async () => {
            Wallet.findOne
                .mockResolvedValueOnce(mockSenderWallet)
                .mockResolvedValueOnce(null); // Recipient wallet not found

            await walletController.sendFunds(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, 'Recipient wallet not found'));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
        });
    });

    // --- TEST SUITE: SUCCESSFUL SEND ---
    describe('Successful Send Funds', () => {
        test('should transfer funds, update balances, and record transactions', async () => {
            const initialSenderBtcBalance = mockSenderWallet.balances.get('BTC'); // 10
            const initialRecipientBtcBalance = mockRecipientWallet.balances.get('BTC'); // 2
            const transferAmount = req.body.amount; // 1

            await walletController.sendFunds(req, res);

            // Assertions for transaction
            expect(mongoose.startSession).toHaveBeenCalled();
            expect(mockSession.startTransaction).toHaveBeenCalled();

            // Assertions for fetches
            expect(Currency.findOne).toHaveBeenCalledWith({ symbol: 'BTC', isActive: true });
            expect(User.findOne).toHaveBeenCalledWith({ $or: [{ username: 'recipientUser' }, { email: 'recipientUser' }] });
            expect(Wallet.findOne).toHaveBeenCalledWith({ userId: mockSenderUser._id });
            expect(Wallet.findOne).toHaveBeenCalledWith({ userId: mockRecipientUser._id });

            // Assertions for balance updates
            expect(mockSenderWallet.balances.get('BTC')).toBe(initialSenderBtcBalance - transferAmount); // 9
            expect(mockRecipientWallet.balances.get('BTC')).toBe(initialRecipientBtcBalance + transferAmount); // 3
            expect(mockSenderWallet.save).toHaveBeenCalledWith({ session: mockSession });
            expect(mockRecipientWallet.save).toHaveBeenCalledWith({ session: mockSession });

            // Assertions for transaction records
            expect(Transaction.create).toHaveBeenCalledTimes(2);
            expect(Transaction.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: mockSenderUser._id,
                    walletId: mockSenderWallet._id,
                    type: 'send',
                    currency: 'BTC',
                    amount: transferAmount,
                    recipientUserId: mockRecipientUser._id,
                    recipientIdentifier: req.body.recipientIdentifier,
                    status: 'COMPLETED',
                    timestamp: expect.any(Date),
                }),
                { session: mockSession }
            );
            expect(Transaction.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: mockRecipientUser._id,
                    walletId: mockRecipientWallet._id,
                    type: 'receive',
                    currency: 'BTC',
                    amount: transferAmount,
                    senderUserId: mockSenderUser._id,
                    senderIdentifier: mockSenderUser.username, // Or email based on your implementation
                    status: 'COMPLETED',
                    timestamp: expect.any(Date),
                }),
                { session: mockSession }
            );

            // Assertions for transaction commit and session end
            expect(mockSession.commitTransaction).toHaveBeenCalled();
            expect(mockSession.abortTransaction).not.toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();

            // Assertions for response
            expect(res.status).not.toHaveBeenCalled(); // Default 200
            expect(res.json).toHaveBeenCalledWith(
                formatResponse(true, 'Funds sent successfully')
            );
            expect(logger.error).not.toHaveBeenCalled();
        });

        test('should handle different recipient identifiers (e.g., email)', async () => {
            req.body.recipientIdentifier = 'recipient@example.com';
            await walletController.sendFunds(req, res);
            expect(User.findOne).toHaveBeenCalledWith({ $or: [{ username: 'recipient@example.com' }, { email: 'recipient@example.com' }] });
            expect(res.json).toHaveBeenCalledWith(formatResponse(true, 'Funds sent successfully'));
        });
    });

    // --- TEST SUITE: ERROR HANDLING & TRANSACTION ROLLBACK ---
    describe('Error Handling and Transaction Rollback', () => {
        test('should abort transaction and return 400 if senderWallet.save fails', async () => {
            const saveError = new Error('Sender wallet save failed');
            mockSenderWallet.save.mockRejectedValue(saveError);

            await walletController.sendFunds(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, saveError.message));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
            expect(mockSession.commitTransaction).not.toHaveBeenCalled();
            expect(logger.error).toHaveBeenCalledWith(`Send funds error: ${saveError.message}`);
        });

        test('should abort transaction and return 400 if recipientWallet.save fails', async () => {
            const saveError = new Error('Recipient wallet save failed');
            mockRecipientWallet.save.mockRejectedValue(saveError);

            await walletController.sendFunds(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, saveError.message));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
            expect(mockSession.commitTransaction).not.toHaveBeenCalled();
            expect(logger.error).toHaveBeenCalledWith(`Send funds error: ${saveError.message}`);
        });

        test('should abort transaction and return 400 if Transaction.create fails for sender', async () => {
            const transactionError = new Error('Failed to create sender transaction');
            Transaction.create.mockRejectedValueOnce(transactionError); // First Transaction.create fails

            await walletController.sendFunds(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, transactionError.message));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
            expect(mockSession.commitTransaction).not.toHaveBeenCalled();
            expect(logger.error).toHaveBeenCalledWith(`Send funds error: ${transactionError.message}`);
        });

        test('should abort transaction and return 400 if Transaction.create fails for recipient', async () => {
            const transactionError = new Error('Failed to create recipient transaction');
            Transaction.create
                .mockResolvedValueOnce(true) // Sender transaction succeeds
                .mockRejectedValueOnce(transactionError); // Recipient transaction fails

            await walletController.sendFunds(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, transactionError.message));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
            expect(mockSession.commitTransaction).not.toHaveBeenCalled();
            expect(logger.error).toHaveBeenCalledWith(`Send funds error: ${transactionError.message}`);
        });

        test('should abort transaction and return 400 for any unexpected error', async () => {
            const generalError = new Error('Unexpected issue during fund send');
            // Simulate an error at an early stage, e.g., Decimal conversion
            jest.spyOn(Decimal.prototype, 'lessThanOrEqualTo').mockImplementation(() => { throw generalError; });

            await walletController.sendFunds(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, generalError.message));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
            expect(mockSession.commitTransaction).not.toHaveBeenCalled();
            expect(logger.error).toHaveBeenCalledWith(`Send funds error: ${generalError.message}`);

            jest.restoreAllMocks(); // Restore Decimal.prototype.lessThanOrEqualTo
        });
    });
});
