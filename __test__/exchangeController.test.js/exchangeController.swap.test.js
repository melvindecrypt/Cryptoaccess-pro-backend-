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
const mockValidateCurrency = jest.fn();
Currency.findOne.mockResolvedValue({ symbol: 'ANY', isActive: true }); // General mock for validateCurrency
Currency.findOne.mockResolvedValueOnce({ symbol: 'BTC', isActive: true }); // For fromCurrency
Currency.findOne.mockResolvedValueOnce({ symbol: 'ETH', isActive: true }); // For toCurrency

// Mock the internal `getSimulatedExchangeRate` function
const mockGetSimulatedExchangeRate = jest.fn();
mockGetSimulatedExchangeRate.mockResolvedValue(new Decimal(20)); // Default: 1 BTC = 20 ETH

describe('exchangeController.swap', () => {
    let req, res;
    let mockWallet;

    // Store original internal functions to restore later if needed
    let getSimulatedExchangeRateOriginal;
    let validateCurrencyOriginal;

    beforeAll(() => {
        // Assume these internal functions are exposed for testing setup
        getSimulatedExchangeRateOriginal = exchangeController.__get__('getSimulatedExchangeRate');
        validateCurrencyOriginal = exchangeController.__get__('validateCurrency');
        exchangeController.__set__('getSimulatedExchangeRate', mockGetSimulatedExchangeRate);
        exchangeController.__set__('validateCurrency', mockValidateCurrency);
    });

    afterAll(() => {
        // Restore original functions
        exchangeController.__set__('getSimulatedExchangeRate', getSimulatedExchangeRateOriginal);
        exchangeController.__set__('validateCurrency', validateCurrencyOriginal);
    });

    beforeEach(() => {
        jest.clearAllMocks();

        // Reset mocks for each test
        mockGetSimulatedExchangeRate.mockResolvedValue(new Decimal(20)); // 1 BTC = 20 ETH
        Currency.findOne.mockResolvedValue({ symbol: 'ANY', isActive: true }); // General mock for validateCurrency
        Currency.findOne.mockResolvedValueOnce({ symbol: 'BTC', isActive: true });
        Currency.findOne.mockResolvedValueOnce({ symbol: 'ETH', isActive: true });
        Transaction.create.mockResolvedValue(true);

        mockWallet = {
            userId: 'userId123',
            _id: 'walletId123',
            balances: { // Direct object access for balances as in the code
                'BTC': 1,
                'ETH': 5,
            },
            transactions: [],
            save: jest.fn().mockResolvedValue(true),
        };
        Wallet.findOne.mockResolvedValue(mockWallet);

        req = {
            user: { _id: 'userId123' },
            body: {
                fromCurrency: 'BTC',
                toCurrency: 'ETH',
                amount: 0.1, // Amount of BTC to swap
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
        test('should return 400 if fromCurrency is missing', async () => {
            req.body.fromCurrency = undefined;
            await exchangeController.swap(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, 'Missing required swap parameters'));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
        });

        test('should return 400 if toCurrency is missing', async () => {
            req.body.toCurrency = undefined;
            await exchangeController.swap(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, 'Missing required swap parameters'));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
        });

        test('should return 400 if amount is missing', async () => {
            req.body.amount = undefined;
            await exchangeController.swap(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, 'Missing required swap parameters'));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
        });

        test('should return 400 if fromCurrency is same as toCurrency', async () => {
            req.body.toCurrency = 'BTC'; // Same as fromCurrency
            await exchangeController.swap(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, 'Cannot swap between the same currency'));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
        });

        test('should return 400 if amount is zero', async () => {
            req.body.amount = 0;
            await exchangeController.swap(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, 'Amount must be positive'));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
        });

        test('should return 400 if amount is negative', async () => {
            req.body.amount = -0.1;
            await exchangeController.swap(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, 'Amount must be positive'));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
        });

        test('should return 404 if wallet not found', async () => {
            Wallet.findOne.mockResolvedValue(null);
            await exchangeController.swap(req, res);
            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, 'Wallet not found'));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
        });

        test('should return 400 if insufficient fromCurrency balance', async () => {
            mockWallet.balances.BTC = 0.05; // Only 0.05 BTC
            req.body.amount = 0.1; // Trying to swap 0.1 BTC
            await exchangeController.swap(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, 'Insufficient BTC balance'));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
        });

        test('should return 400 if fromCurrency is unsupported', async () => {
            req.body.fromCurrency = 'XYZ';
            Currency.findOne
                .mockResolvedValueOnce(null) // Mock validateCurrency for fromCurrency to fail
                .mockResolvedValueOnce({ symbol: 'ETH', isActive: true }); // toCurrency still ok

            await exchangeController.swap(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, 'Unsupported currency: XYZ'));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
        });

        test('should return 400 if toCurrency is unsupported', async () => {
            req.body.toCurrency = 'ABC';
            Currency.findOne
                .mockResolvedValueOnce({ symbol: 'BTC', isActive: true }) // fromCurrency ok
                .mockResolvedValueOnce(null); // Mock validateCurrency for toCurrency to fail

            await exchangeController.swap(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, 'Unsupported currency: ABC'));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
        });
    });

    // --- TEST SUITE: SUCCESSFUL SWAP ---
    describe('Successful Swap', () => {
        test('should successfully swap currencies, update balances, and record transaction', async () => {
            const initialBtcBalance = mockWallet.balances.BTC; // 1
            const initialEthBalance = mockWallet.balances.ETH; // 5
            const amountToSwap = req.body.amount; // 0.1 BTC
            const simulatedRate = 20; // 1 BTC = 20 ETH
            mockGetSimulatedExchangeRate.mockResolvedValue(new Decimal(simulatedRate));
            const expectedEthReceived = new Decimal(amountToSwap).multipliedBy(simulatedRate).toNumber(); // 0.1 * 20 = 2 ETH

            await exchangeController.swap(req, res);

            // Assertions for transaction
            expect(mongoose.startSession).toHaveBeenCalled();
            expect(mockSession.startTransaction).toHaveBeenCalled();

            // Assertions for internal calls
            expect(Currency.findOne).toHaveBeenCalledWith({ symbol: 'BTC', isActive: true });
            expect(Currency.findOne).toHaveBeenCalledWith({ symbol: 'ETH', isActive: true });
            expect(mockGetSimulatedExchangeRate).toHaveBeenCalledWith('BTC', 'ETH');
            expect(Wallet.findOne).toHaveBeenCalledWith({ userId: req.user._id });

            // Assertions for balance updates (direct object property access)
            expect(mockWallet.balances.BTC).toBe(new Decimal(initialBtcBalance).minus(amountToSwap).toNumber()); // 0.9 BTC
            expect(mockWallet.balances.ETH).toBe(new Decimal(initialEthBalance).plus(expectedEthReceived).toNumber()); // 7 ETH

            expect(mockWallet.save).toHaveBeenCalledWith({ session: mockSession });

            // Assertions for transaction recording
            expect(Transaction.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: req.user._id,
                    walletId: mockWallet._id,
                    type: 'swap',
                    fromCurrency: 'BTC',
                    toCurrency: 'ETH',
                    amount: amountToSwap,
                    received: expectedEthReceived,
                    rate: simulatedRate,
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
                formatResponse(true, 'Swap executed successfully', { receivedAmount: expectedEthReceived })
            );
            expect(logger.error).not.toHaveBeenCalled();
        });
    });

    // --- TEST SUITE: ERROR HANDLING & TRANSACTION ROLLBACK ---
    describe('Error Handling and Transaction Rollback', () => {
        test('should abort transaction and return 400 if wallet.save fails', async () => {
            const saveError = new Error('Wallet save failed');
            mockWallet.save.mockRejectedValue(saveError);

            await exchangeController.swap(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, saveError.message));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
            expect(mockSession.commitTransaction).not.toHaveBeenCalled();
            expect(logger.error).toHaveBeenCalledWith(`Swap error: ${saveError.message}`);
        });

        test('should abort transaction and return 400 if Transaction.create fails', async () => {
            const transactionError = new Error('Failed to create swap transaction');
            Transaction.create.mockRejectedValue(transactionError);

            await exchangeController.swap(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, transactionError.message));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
            expect(mockSession.commitTransaction).not.toHaveBeenCalled();
            expect(logger.error).toHaveBeenCalledWith(`Swap error: ${transactionError.message}`);
        });

        test('should abort transaction and return 400 for general unexpected errors', async () => {
            const generalError = new Error('Something unexpected happened');
            Wallet.findOne.mockRejectedValue(generalError); // Simulate early error

            await exchangeController.swap(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, generalError.message));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
            expect(mockSession.commitTransaction).not.toHaveBeenCalled();
            expect(logger.error).toHaveBeenCalledWith(`Swap error: ${generalError.message}`);
        });
    });
});
