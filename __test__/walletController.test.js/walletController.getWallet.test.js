const walletController = require('../../controllers/WalletController');
const Wallet = require('../../models/Wallet');
const { formatResponse } = require('../../utils/helpers');
const logger = require('../../utils/logger');

// Mock external modules
jest.mock('../../models/Wallet');
jest.mock('../../utils/helpers', () => ({
    formatResponse: jest.fn((success, message, data) => ({ success, message, data })),
}));
jest.mock('../../utils/logger', () => ({
    info: jest.fn(),
    error: jest.fn(),
}));

describe('walletController.getWallet', () => {
    let req, res;

    beforeEach(() => {
        jest.clearAllMocks();

        // Default mock wallet
        Wallet.findOne.mockReturnThis(); // Allows chaining .select().lean()
        Wallet.select.mockReturnThis();
        Wallet.lean.mockResolvedValue({
            balances: {
                'BTC': 0.5,
                'ETH': 2.0
            },
            transactions: [
                { type: 'deposit', amount: 1, currency: 'BTC', timestamp: new Date() },
                { type: 'withdrawal', amount: 0.1, currency: 'ETH', timestamp: new Date() },
                // Add more mock transactions to test slicing
                ...Array(25).fill(null).map((_, i) => ({ type: 'test', amount: i, currency: 'TEST', timestamp: new Date() }))
            ]
        });

        // Mock request and response objects
        req = {
            user: { _id: 'userId123' } // req.user from authentication middleware
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

    // --- TEST SUITE: SUCCESSFUL RETRIEVAL ---
    describe('Successful Wallet Retrieval', () => {
        test('should return 200 and wallet data with last 20 transactions', async () => {
            await walletController.getWallet(req, res);

            // Assertions for Mongoose query chain
            expect(Wallet.findOne).toHaveBeenCalledWith({ userId: req.user._id });
            expect(Wallet.select).toHaveBeenCalledWith('balances transactions');
            expect(Wallet.lean).toHaveBeenCalled();

            // Assertions for response
            expect(res.json).toHaveBeenCalledWith(
                formatResponse(true, 'Wallet retrieved successfully', {
                    balances: { 'BTC': 0.5, 'ETH': 2.0 },
                    recentTransactions: expect.arrayContaining([
                        // Expecting the last 20 transactions
                        expect.objectContaining({ type: 'test' })
                    ])
                })
            );
            // Verify exactly 20 transactions
            const recentTransactionsArg = res.json.mock.calls[0][0].data.recentTransactions;
            expect(recentTransactionsArg.length).toBe(20);

            expect(res.status).not.toHaveBeenCalled();
            expect(logger.error).not.toHaveBeenCalled();
        });

        test('should return all transactions if less than 20', async () => {
            Wallet.lean.mockResolvedValue({
                balances: { 'BTC': 1 },
                transactions: [
                    { type: 'deposit', amount: 1, currency: 'BTC', timestamp: new Date() },
                    { type: 'withdrawal', amount: 0.1, currency: 'ETH', timestamp: new Date() },
                ]
            });

            await walletController.getWallet(req, res);

            const recentTransactionsArg = res.json.mock.calls[0][0].data.recentTransactions;
            expect(recentTransactionsArg.length).toBe(2);
            expect(res.json).toHaveBeenCalledWith(
                formatResponse(true, 'Wallet retrieved successfully', {
                    balances: { 'BTC': 1 },
                    recentTransactions: expect.arrayContaining([
                        expect.objectContaining({ type: 'deposit' }),
                        expect.objectContaining({ type: 'withdrawal' })
                    ])
                })
            );
        });

        test('should return empty transactions array if wallet has no transactions', async () => {
            Wallet.lean.mockResolvedValue({
                balances: { 'BTC': 1 },
                transactions: []
            });

            await walletController.getWallet(req, res);

            expect(res.json).toHaveBeenCalledWith(
                formatResponse(true, 'Wallet retrieved successfully', {
                    balances: { 'BTC': 1 },
                    recentTransactions: []
                })
            );
        });

        test('should return empty transactions array if wallet has no transactions property', async () => {
            Wallet.lean.mockResolvedValue({
                balances: { 'BTC': 1 }
            }); // Missing transactions property

            await walletController.getWallet(req, res);

            expect(res.json).toHaveBeenCalledWith(
                formatResponse(true, 'Wallet retrieved successfully', {
                    balances: { 'BTC': 1 },
                    recentTransactions: [] // Should default to empty array
                })
            );
        });
    });

    // --- TEST SUITE: WALLET NOT FOUND ---
    describe('Wallet Not Found', () => {
        test('should return 404 if wallet is not found for the user', async () => {
            Wallet.lean.mockResolvedValue(null); // Mock wallet not found

            await walletController.getWallet(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith(
                formatResponse(false, 'Wallet not found')
            );
            expect(logger.error).not.toHaveBeenCalled();
        });
    });

    // --- TEST SUITE: ERROR HANDLING ---
    describe('Error Handling', () => {
        test('should return 500 on a database error during wallet fetch', async () => {
            const mockError = new Error('Database connection failed');
            Wallet.lean.mockRejectedValue(mockError); // Simulate a database error

            await walletController.getWallet(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith(
                formatResponse(false, 'Server error while fetching wallet')
            );
            expect(logger.error).toHaveBeenCalledWith(`Wallet fetch error: ${mockError.message}`);
        });

        test('should return 500 for general unexpected errors', async () => {
            const unexpectedError = new Error('Unexpected issue');
            Wallet.findOne.mockImplementation(() => { throw unexpectedError; });

            await walletController.getWallet(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith(
                formatResponse(false, 'Server error while fetching wallet')
            );
            expect(logger.error).toHaveBeenCalledWith(`Wallet fetch error: ${unexpectedError.message}`);
        });
    });
});
