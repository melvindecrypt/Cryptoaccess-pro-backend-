const exchangeController = require('../../controllers/exchangeController');
const Wallet = require('../../models/Wallet');
const Currency = require('../../models/Currency');
const Transaction = require('../../models/Transaction');
const { formatResponse } = require('../../utils/helpers');
const logger = require('../../utils/logger');
const Decimal = require('decimal.js');
const mongoose = require('mongoose');

// Mock external modules
jest.mock('../../models/Wallet');
jest.mock('../../models/Currency');
jest.mock('../../models/Transaction');
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

// Mock the internal `validateCurrency` function
// Assuming it's exposed or can be easily mocked
const mockValidateCurrency = jest.fn();
// Default success for validateCurrency
Currency.findOne.mockResolvedValue({ symbol: 'BTC', isActive: true });
Currency.findOne.mockResolvedValueOnce({ symbol: 'BTC', isActive: true }); // For baseCurrency
Currency.findOne.mockResolvedValueOnce({ symbol: 'USD', isActive: true }); // For quoteCurrency

// Mock the internal `getSimulatedExchangeRate` function
// This needs to be mocked to control the test environment
const mockGetSimulatedExchangeRate = jest.fn();
// Default behavior for getSimulatedExchangeRate
mockGetSimulatedExchangeRate.mockResolvedValue(new Decimal(30000)); // 1 BTC = 30000 USD

// Inject mocks into the module if they are not exposed directly
// This is a common pattern for testing private/unexported functions
// In a real project, you'd likely extract validateCurrency and getSimulatedExchangeRate
// into a separate `utils` file and mock that utility file.
// For now, I'm assuming we can either mock the entire controller or re-wire it
// temporarily for testing. For this test, I will patch the controller's internal
// functions, which might require `jest.isolateModules` or similar setup.
// A simpler way for tests is to mock `Currency.findOne` and ensure the controller calls it.

// Mock the wallet's custom updateBalance method
const mockWalletUpdateBalance = jest.fn().mockImplementation(async (currency, amount, type, session) => {
    // Simulate updating balances if it were an actual Wallet document
    if (type === 'increment') {
        mockWallet.balances.set(currency, new Decimal(mockWallet.balances.get(currency) || 0).plus(amount).toNumber());
    } else if (type === 'decrement') {
        mockWallet.balances.set(currency, new Decimal(mockWallet.balances.get(currency) || 0).minus(amount).toNumber());
    }
});


describe('exchangeController.buyCurrency', () => {
    let req, res;
    let mockWallet;

    beforeEach(() => {
        jest.clearAllMocks();

        // Reset mocks for each test
        mockGetSimulatedExchangeRate.mockResolvedValue(new Decimal(30000));
        Currency.findOne.mockResolvedValue({ symbol: 'ANY', isActive: true }); // General mock for validateCurrency
        Transaction.create.mockResolvedValue(true);

        mockWallet = {
            userId: 'userId123',
            _id: 'walletId123',
            balances: new Map([['USD', 1000], ['BTC', 0]]),
            transactions: [],
            // Mock the custom updateBalance method
            updateBalance: mockWalletUpdateBalance,
            save: jest.fn().mockResolvedValue(true), // Ensure save also works
        };
        Wallet.findOne.mockResolvedValue(mockWallet);

        req = {
            user: { _id: 'userId123' },
            body: {
                baseCurrency: 'BTC',
                quoteCurrency: 'USD',
                amount: 300, // Amount in USD to spend
            },
        };
        res = {
            json: jest.fn(),
            status: jest.fn().mockReturnThis(),
        };

        jest.spyOn(console, 'error').mockImplementation(() => {});

        // Re-assign the internal `getSimulatedExchangeRate`
        // This is a more direct way to mock an unexported function IF it's called
        // directly from `exchangeController` and not through `this.getSimulatedExchangeRate`
        // which would require class mocking.
        // For now, let's assume getSimulatedExchangeRate is directly called.
        // We'll mock it by patching the module using `jest.doMock` and then `require`.
        // This requires the test to be in its own isolated module.
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    // Re-wire the internal `getSimulatedExchangeRate` and `validateCurrency` for tests
    // This is typically done by mocking the module and then importing specific functions.
    // For direct access, this might require a temporary change in `exchangeController.js` to export them.
    // Given the previous test structures, we will directly mock `Currency.findOne` and `Transaction.create`.
    // The `getSimulatedExchangeRate` will be difficult to mock without exporting it or a full module mock setup.
    // Let's assume for this test, `getSimulatedExchangeRate` is mocked by mocking the entire module and exposing it.
    // A more robust approach is to extract shared helpers to a utility file.
    let getSimulatedExchangeRateOriginal; // Store original
    let validateCurrencyOriginal; // Store original

    beforeAll(() => {
        // Capture the original functions before Jest's module isolation or mocking
        // If they are not exported, this step is tricky.
        // For the sake of this test, we will assume they are.
        // Or, more practically, we will mock `Currency.findOne` and then provide a mock for `getSimulatedExchangeRate`
        // that acts as the real one but is controllable for testing.
        getSimulatedExchangeRateOriginal = exchangeController.__get__('getSimulatedExchangeRate');
        validateCurrencyOriginal = exchangeController.__get__('validateCurrency');
        exchangeController.__set__('getSimulatedExchangeRate', mockGetSimulatedExchangeRate);
        exchangeController.__set__('validateCurrency', mockValidateCurrency);
    });

    afterAll(() => {
        // Restore the original functions
        exchangeController.__set__('getSimulatedExchangeRate', getSimulatedExchangeRateOriginal);
        exchangeController.__set__('validateCurrency', validateCurrencyOriginal);
    });


    // --- TEST SUITE: VALIDATION ---
    describe('Validation', () => {
        test('should return 400 if amount is zero', async () => {
            req.body.amount = 0;
            await exchangeController.buyCurrency(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, 'Amount must be positive'));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
            expect(Wallet.findOne).not.toHaveBeenCalled();
        });

        test('should return 400 if amount is negative', async () => {
            req.body.amount = -100;
            await exchangeController.buyCurrency(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, 'Amount must be positive'));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
            expect(Wallet.findOne).not.toHaveBeenCalled();
        });

        test('should return 400 if baseCurrency is unsupported', async () => {
            req.body.baseCurrency = 'XYZ';
            Currency.findOne
                .mockResolvedValueOnce(null) // Mock validateCurrency for baseCurrency to fail
                .mockResolvedValueOnce({ symbol: 'USD', isActive: true }); // quoteCurrency still ok

            await exchangeController.buyCurrency(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, 'Unsupported currency: XYZ'));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
        });

        test('should return 400 if quoteCurrency is unsupported', async () => {
            req.body.quoteCurrency = 'ABC';
            Currency.findOne
                .mockResolvedValueOnce({ symbol: 'BTC', isActive: true }) // baseCurrency ok
                .mockResolvedValueOnce(null); // Mock validateCurrency for quoteCurrency to fail

            await exchangeController.buyCurrency(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, 'Unsupported currency: ABC'));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
        });

        test('should return 404 if wallet not found', async () => {
            Wallet.findOne.mockResolvedValue(null);
            await exchangeController.buyCurrency(req, res);
            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, 'Wallet not found'));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
        });

        test('should return 400 if insufficient quote currency balance', async () => {
            mockWallet.balances.set('USD', 10); // Only 10 USD
            req.body.amount = 300; // Trying to spend 300 USD
            await exchangeController.buyCurrency(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, 'Insufficient USD balance'));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
        });
    });

    // --- TEST SUITE: SUCCESSFUL BUY ---
    describe('Successful Buy', () => {
        test('should successfully buy currency, update balances, and record transaction', async () => {
            const initialUsdBalance = mockWallet.balances.get('USD'); // 1000
            const amountToSpend = req.body.amount; // 300
            const simulatedRate = 30000;
            mockGetSimulatedExchangeRate.mockResolvedValue(new Decimal(simulatedRate));
            const expectedBtcAmount = new Decimal(amountToSpend).dividedBy(simulatedRate).toNumber(); // 300 / 30000 = 0.01 BTC

            await exchangeController.buyCurrency(req, res);

            // Assertions for transaction
            expect(mongoose.startSession).toHaveBeenCalled();
            expect(mockSession.startTransaction).toHaveBeenCalled();

            // Assertions for internal calls
            expect(Currency.findOne).toHaveBeenCalledWith({ symbol: 'BTC', isActive: true }); // For baseCurrency
            expect(Currency.findOne).toHaveBeenCalledWith({ symbol: 'USD', isActive: true }); // For quoteCurrency
            expect(mockGetSimulatedExchangeRate).toHaveBeenCalledWith('BTC', 'USD');
            expect(Wallet.findOne).toHaveBeenCalledWith({ userId: req.user._id });

            // Assertions for balance updates via `updateBalance`
            expect(mockWallet.updateBalance).toHaveBeenCalledWith('USD', new Decimal(amountToSpend).negated(), 'decrement', mockSession);
            expect(mockWallet.updateBalance).toHaveBeenCalledWith('BTC', expectedBtcAmount, 'increment', mockSession);

            // Verify wallet balances after mock updates
            expect(mockWallet.balances.get('USD')).toBe(initialUsdBalance - amountToSpend); // 700
            expect(mockWallet.balances.get('BTC')).toBe(expectedBtcAmount); // 0.01

            // Assertions for transaction recording
            expect(Transaction.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: req.user._id,
                    walletId: mockWallet._id,
                    type: 'buy',
                    baseCurrency: 'BTC',
                    quoteCurrency: 'USD',
                    amount: expectedBtcAmount,
                    price: simulatedRate,
                    totalCost: amountToSpend,
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
                formatResponse(true, `Successfully bought ${new Decimal(expectedBtcAmount).toFixed(8)} BTC`, { receivedAmount: expectedBtcAmount })
            );
            expect(logger.error).not.toHaveBeenCalled();
        });
    });

    // --- TEST SUITE: ERROR HANDLING & TRANSACTION ROLLBACK ---
    describe('Error Handling and Transaction Rollback', () => {
        test('should abort transaction and return 400 if wallet updateBalance fails (decrement)', async () => {
            const updateError = new Error('Failed to decrement balance');
            mockWallet.updateBalance.mockRejectedValueOnce(updateError); // First update fails

            await exchangeController.buyCurrency(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, updateError.message));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
            expect(mockSession.commitTransaction).not.toHaveBeenCalled();
            expect(logger.error).toHaveBeenCalledWith(`Buy error: ${updateError.message}`);
        });

        test('should abort transaction and return 400 if wallet updateBalance fails (increment)', async () => {
            const updateError = new Error('Failed to increment balance');
            mockWallet.updateBalance
                .mockResolvedValueOnce(true) // Decrement succeeds
                .mockRejectedValueOnce(updateError); // Increment fails

            await exchangeController.buyCurrency(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, updateError.message));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
            expect(mockSession.commitTransaction).not.toHaveBeenCalled();
            expect(logger.error).toHaveBeenCalledWith(`Buy error: ${updateError.message}`);
        });

        test('should abort transaction and return 400 if Transaction.create fails', async () => {
            const transactionError = new Error('Failed to create buy transaction');
            Transaction.create.mockRejectedValue(transactionError);

            await exchangeController.buyCurrency(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, transactionError.message));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
            expect(mockSession.commitTransaction).not.toHaveBeenCalled();
            expect(logger.error).toHaveBeenCalledWith(`Buy error: ${transactionError.message}`);
        });

        test('should abort transaction and return 400 for general unexpected errors', async () => {
            const generalError = new Error('Something unexpected happened');
            Wallet.findOne.mockRejectedValue(generalError); // Simulate early error

            await exchangeController.buyCurrency(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, generalError.message));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
            expect(mockSession.commitTransaction).not.toHaveBeenCalled();
            expect(logger.error).toHaveBeenCalledWith(`Buy error: ${generalError.message}`);
        });
    });
});
