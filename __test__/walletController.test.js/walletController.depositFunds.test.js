const walletController = require('../../controllers/WalletController');
const Wallet = require('../../models/Wallet');
const Currency = require('../../models/Currency'); // For validateCurrency
const { formatResponse } = require('../../utils/helpers');
const logger = require('../../utils/logger');
const Decimal = require('decimal.js');

// Mock external modules
jest.mock('../../models/Wallet');
jest.mock('../../models/Currency'); // For validateCurrency
jest.mock('../../utils/helpers', () => ({
    formatResponse: jest.fn((success, message, data) => ({ success, message, data })),
}));
jest.mock('../../utils/logger', () => ({
    info: jest.fn(),
    error: jest.fn(),
}));

// Helper to access the internal validateCurrency if not exported directly
// We'll mock its behavior rather than testing its internal logic here, as it's a dependency.
const mockValidateCurrency = jest.fn();

describe('walletController.depositFunds', () => {
    let req, res;
    const REAL_WALLET_ADDRESSES = {
        BTC: "bc1qrhmqgnwml62udh5c5wnyukx65rdtqdsa58p54l",
        ETH: "0xEe19FeE35ef7257c5Bcd8a1206dB6b1fCdf8e767",
    };

    // Spy on the actual REAL_WALLET_ADDRESSES to allow testing it
    // Or, better yet, pass it as a parameter or require it from a separate config file
    // For now, I'll rely on it being present in the controller and ensure mock for validateCurrency.
    // If you plan to test `REAL_WALLET_ADDRESSES` directly, it might need to be mocked/stubbed.

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock validateCurrency to succeed by default
        mockValidateCurrency.mockResolvedValue({ symbol: 'BTC', name: 'Bitcoin', isActive: true });

        // Mock Wallet.findOneAndUpdate
        Wallet.findOneAndUpdate.mockResolvedValue({
            userId: 'userId123',
            balances: { 'BTC': 10.5 }, // Example new balance after update
            transactions: [{ type: 'deposit', amount: 0.5, currency: 'BTC' }]
        });

        // Mock request and response objects
        req = {
            user: { _id: 'userId123' },
            body: {
                currency: 'BTC',
                amount: 0.5,
            },
        };
        res = {
            json: jest.fn(),
            status: jest.fn().mockReturnThis(),
        };

        jest.spyOn(console, 'error').mockImplementation(() => {});

        // Re-assign the internal validateCurrency in the module context (if it was an internal function)
        // This is a hacky way to test internal functions if they are not exported.
        // A cleaner approach is to extract `validateCurrency` to a separate `utils` file and import it.
        // For this test, I'm assuming it's available via a re-export or I'm directly patching the module.
        // For the purpose of these tests, I will make a simplified mock that replaces the internal `validateCurrency` logic.
        // This is necessary because `validateCurrency` isn't a direct import in the test file, but an internal function.
        // This assumes access to the module's private state, which Jest allows if you mock the whole module.
        // However, a better pattern is to test `validateCurrency` directly by exporting it.
        // For this test, I'll just mock the Currency.findOne that `validateCurrency` uses.
        Currency.findOne.mockResolvedValue({ symbol: 'BTC', isActive: true }); // Default for internal validateCurrency
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    // --- TEST SUITE: VALIDATION ---
    describe('Validation', () => {
        test('should return 400 if amount is zero', async () => {
            req.body.amount = 0;
            await walletController.depositFunds(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, 'Amount must be positive'));
            expect(logger.error).not.toHaveBeenCalled();
            expect(Wallet.findOneAndUpdate).not.toHaveBeenCalled();
        });

        test('should return 400 if amount is negative', async () => {
            req.body.amount = -1;
            await walletController.depositFunds(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, 'Amount must be positive'));
            expect(logger.error).not.toHaveBeenCalled();
            expect(Wallet.findOneAndUpdate).not.toHaveBeenCalled();
        });

        test('should return 400 if currency is unsupported', async () => {
            req.body.currency = 'XYZ';
            Currency.findOne.mockResolvedValue(null); // Simulate validateCurrency throwing error

            await walletController.depositFunds(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, 'Unsupported currency: XYZ'));
            expect(logger.error).toHaveBeenCalledWith('Deposit error: Unsupported currency: XYZ');
            expect(Wallet.findOneAndUpdate).not.toHaveBeenCalled();
        });
    });

    // --- TEST SUITE: SUCCESSFUL DEPOSIT ---
    describe('Successful Deposit', () => {
        test('should update wallet balance and add transaction for a valid deposit', async () => {
            const depositAmount = req.body.amount;
            const expectedUpdatedBalance = new Decimal(Wallet.findOneAndUpdate.mock.results[0].value.balances.BTC);

            await walletController.depositFunds(req, res);

            // Assertions for validateCurrency (internal call)
            expect(Currency.findOne).toHaveBeenCalledWith({ symbol: 'BTC', isActive: true });

            // Assertions for Wallet.findOneAndUpdate
            expect(Wallet.findOneAndUpdate).toHaveBeenCalledWith(
                { userId: req.user._id },
                {
                    $inc: { [`balances.${req.body.currency}`]: depositAmount },
                    $push: {
                        transactions: {
                            type: 'deposit',
                            currency: req.body.currency,
                            amount: depositAmount,
                            status: 'COMPLETED',
                            timestamp: expect.any(Date),
                            targetAddress: REAL_WALLET_ADDRESSES[req.body.currency]
                        }
                    }
                },
                { new: true, runValidators: true }
            );

            // Assertions for response
            expect(res.status).not.toHaveBeenCalled(); // Default 200
            expect(res.json).toHaveBeenCalledWith(
                formatResponse(true, 'Deposit initialized', {
                    depositAddress: REAL_WALLET_ADDRESSES[req.body.currency],
                    requiredConfirmations: 3,
                    estimatedArrival: expect.any(Number) // Timestamp
                })
            );

            expect(logger.error).not.toHaveBeenCalled();
        });
    });

    // --- TEST SUITE: ERROR HANDLING ---
    describe('Error Handling', () => {
        test('should return 400 if Wallet.findOneAndUpdate fails', async () => {
            const dbError = new Error('Database write error');
            Wallet.findOneAndUpdate.mockRejectedValue(dbError);

            await walletController.depositFunds(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, dbError.message));
            expect(logger.error).toHaveBeenCalledWith(`Deposit error: ${dbError.message}`);
        });

        test('should return 400 for any unexpected error during deposit', async () => {
            const unexpectedError = new Error('Network issue');
            // Simulate an error at an early stage
            Currency.findOne.mockRejectedValue(unexpectedError); // Cause validateCurrency to fail

            await walletController.depositFunds(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, unexpectedError.message));
            expect(logger.error).toHaveBeenCalledWith(`Deposit error: ${unexpectedError.message}`);
        });
    });
});
