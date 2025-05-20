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

// Mock the internal `validateCurrency` function via Currency.findOne
Currency.findOne.mockResolvedValue({ symbol: 'ANY', isActive: true }); // General mock for validateCurrency
Currency.findOne.mockResolvedValueOnce({ symbol: 'BTC', isActive: true }); // For baseCurrency
Currency.findOne.mockResolvedValueOnce({ symbol: 'USD', isActive: true }); // For quoteCurrency

// Mock the internal `getSimulatedExchangeRate` function
const mockGetSimulatedExchangeRate = jest.fn();
mockGetSimulatedExchangeRate.mockResolvedValue(new Decimal(30000)); // 1 BTC = 30000 USD

// Mock the wallet's custom updateBalance method
const mockWalletUpdateBalance = jest.fn().mockImplementation(async (currency, amount, type, session) => {
    if (type === 'increment') {
        mockWallet.balances.set(currency, new Decimal(mockWallet.balances.get(currency) || 0).plus(amount).toNumber());
    } else if (type === 'decrement') {
        mockWallet.balances.set(currency, new Decimal(mockWallet.balances.get(currency) || 0).minus(amount).toNumber());
    }
});


describe('exchangeController.sellCurrency', () => {
    let req, res;
    let mockWallet;

    // Store original internal functions to restore later if needed
    let getSimulatedExchangeRateOriginal;
    let validateCurrencyOriginal;

    beforeAll(() => {
        // Assume these internal functions are exposed for testing setup
        // This setup needs to be done carefully depending on how your module is structured
        getSimulatedExchangeRateOriginal = exchangeController.__get__('getSimulatedExchangeRate');
        validateCurrencyOriginal = exchangeController.__get__('validateCurrency');
        exchangeController.__set__('getSimulatedExchangeRate', mockGetSimulatedExchangeRate);
        exchangeController.__set__('validateCurrency', mockValidateCurrency); // Assuming mockValidateCurrency is defined
    });

    afterAll(() => {
        // Restore original functions
        exchangeController.__set__('getSimulatedExchangeRate', getSimulatedExchangeRateOriginal);
        exchangeController.__set__('validateCurrency', validateCurrencyOriginal);
    });

    beforeEach(() => {
        jest.clearAllMocks();

        // Reset mocks for each test
        mockGetSimulatedExchangeRate.mockResolvedValue(new Decimal(30000));
        Currency.findOne.mockResolvedValue({ symbol: 'ANY', isActive: true }); // General mock for validateCurrency
        Currency.findOne.mockResolvedValueOnce({ symbol: 'BTC', isActive: true });
        Currency.findOne.mockResolvedValueOnce({ symbol: 'USD', isActive: true });
        Transaction.create.mockResolvedValue(true);

        mockWallet = {
            userId: 'userId123',
            _id: 'walletId123',
            balances: new Map([['BTC', 0.5], ['USD', 1000]]), // Initial BTC balance
            transactions: [],
            updateBalance: mockWalletUpdateBalance,
            save: jest.fn().mockResolvedValue(true),
        };
        Wallet.findOne.mockResolvedValue(mockWallet);

        req = {
            user: { _id: 'userId123' },
            body: {
                baseCurrency: 'BTC',
                quoteCurrency: 'USD',
                amount: 0.01, // Amount of BTC to sell
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


    // --- TEST SUITE: VALIDATION ---
    describe('Validation', () => {
        test('should return 400 if amount is zero', async () => {
            req.body.amount = 0;
            await exchangeController.sellCurrency(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, 'Amount must be positive'));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
            expect(Wallet.findOne).not.toHaveBeenCalled();
        });

        test('should return 400 if amount is negative', async () => {
            req.body.amount = -0.001;
            await exchangeController.sellCurrency(req, res);
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

            await exchangeController.sellCurrency(req, res);
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

            await exchangeController.sellCurrency(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, 'Unsupported currency: ABC'));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
        });

        test('should return 404 if wallet not found', async () => {
            Wallet.findOne.mockResolvedValue(null);
            await exchangeController.sellCurrency(req, res);
            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, 'Wallet not found'));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
        });

        test('should return 400 if insufficient base currency balance', async () => {
            mockWallet.balances.set('BTC', 0.005); // Only 0.005 BTC
            req.body.amount = 0.01; // Trying to sell 0.01 BTC
            await exchangeController.sellCurrency(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, 'Insufficient BTC balance'));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
        });
    });

    // --- TEST SUITE: SUCCESSFUL SELL ---
    describe('Successful Sell', () => {
        test('should successfully sell currency, update balances, and record transaction', async () => {
            const initialBtcBalance = mockWallet.balances.get('BTC'); // 0.5
            const initialUsdBalance = mockWallet.balances.get('USD'); // 1000
            const amountToSell = req.body.amount; // 0.01
            const simulatedRate = 30000;
            mockGetSimulatedExchangeRate.mockResolvedValue(new Decimal(simulatedRate));
            const expectedUsdAmount = new Decimal(amountToSell).multipliedBy(simulatedRate).toNumber(); // 0.01 * 30000 = 300 USD

            await exchangeController.sellCurrency(req, res);

            // Assertions for transaction
            expect(mongoose.startSession).toHaveBeenCalled();
            expect(mockSession.startTransaction).toHaveBeenCalled();

            // Assertions for internal calls
            expect(Currency.findOne).toHaveBeenCalledWith({ symbol: 'BTC', isActive: true });
            expect(Currency.findOne).toHaveBeenCalledWith({ symbol: 'USD', isActive: true });
            expect(mockGetSimulatedExchangeRate).toHaveBeenCalledWith('BTC', 'USD');
            expect(Wallet.findOne).toHaveBeenCalledWith({ userId: req.user._id });

            // Assertions for balance updates via `updateBalance`
            expect(mockWallet.updateBalance).toHaveBeenCalledWith('BTC', new Decimal(amountToSell).negated(), 'decrement', mockSession);
            expect(mockWallet.updateBalance).toHaveBeenCalledWith('USD', expectedUsdAmount, 'increment', mockSession);

            // Verify wallet balances after mock updates
            expect(mockWallet.balances.get('BTC')).toBe(initialBtcBalance - amountToSell); // 0.49
            expect(mockWallet.balances.get('USD')).toBe(initialUsdBalance + expectedUsdAmount); // 1300

            // Assertions for transaction recording
            expect(Transaction.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: req.user._id,
                    walletId: mockWallet._id,
                    type: 'sell',
                    baseCurrency: 'BTC',
                    quoteCurrency: 'USD',
                    amount: amountToSell,
                    price: simulatedRate,
                    receivedAmount: expectedUsdAmount,
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
                formatResponse(true, `Successfully sold ${new Decimal(amountToSell).toFixed(8)} BTC`, { receivedAmount: expectedUsdAmount })
            );
            expect(logger.error).not.toHaveBeenCalled();
        });
    });

    // --- TEST SUITE: ERROR HANDLING & TRANSACTION ROLLBACK ---
    describe('Error Handling and Transaction Rollback', () => {
        test('should abort transaction and return 400 if wallet updateBalance fails (decrement)', async () => {
            const updateError = new Error('Failed to decrement balance');
            mockWallet.updateBalance.mockRejectedValueOnce(updateError);

            await exchangeController.sellCurrency(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, updateError.message));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
            expect(mockSession.commitTransaction).not.toHaveBeenCalled();
            expect(logger.error).toHaveBeenCalledWith(`Sell error: ${updateError.message}`);
        });

        test('should abort transaction and return 400 if wallet updateBalance fails (increment)', async () => {
            const updateError = new Error('Failed to increment balance');
            mockWallet.updateBalance
                .mockResolvedValueOnce(true)
                .mockRejectedValueOnce(updateError);

            await exchangeController.sellCurrency(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, updateError.message));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
            expect(mockSession.commitTransaction).not.toHaveBeenCalled();
            expect(logger.error).toHaveBeenCalledWith(`Sell error: ${updateError.message}`);
        });

        test('should abort transaction and return 400 if Transaction.create fails', async () => {
            const transactionError = new Error('Failed to create sell transaction');
            Transaction.create.mockRejectedValue(transactionError);

            await exchangeController.sellCurrency(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, transactionError.message));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
            expect(mockSession.commitTransaction).not.toHaveBeenCalled();
            expect(logger.error).toHaveBeenCalledWith(`Sell error: ${transactionError.message}`);
        });

        test('should abort transaction and return 400 for general unexpected errors', async () => {
            const generalError = new Error('Something unexpected happened');
            Wallet.findOne.mockRejectedValue(generalError);

            await exchangeController.sellCurrency(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, generalError.message));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
            expect(mockSession.commitTransaction).not.toHaveBeenCalled();
            expect(logger.error).toHaveBeenCalledWith(`Sell error: ${generalError.message}`);
        });
    });
});
