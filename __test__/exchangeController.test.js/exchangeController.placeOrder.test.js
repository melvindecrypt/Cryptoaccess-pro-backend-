const exchangeController = require('../../controllers/exchangeController');
const Wallet = require('../../models/Wallet');
const { formatResponse } = require('../../utils/helpers');
const logger = require('../../utils/logger');
const Decimal = require('decimal.js');
const mongoose = require('mongoose');
const Currency = require('../../models/Currency'); // For validateCurrency

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

// Mock mongoose session and transaction capabilities
const mockSession = {
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    abortTransaction: jest.fn(),
    endSession: jest.fn(),
};
jest.spyOn(mongoose, 'startSession').mockResolvedValue(mockSession);

// Mock the internal `validateCurrency` function (via Currency.findOne)
Currency.findOne.mockResolvedValue({ symbol: 'ANY', isActive: true }); // General mock

// Mock the internal order book functions to control their behavior
const mockGetOrderBook = jest.fn();
const mockMatchOrders = jest.fn();
const mockSortBuyOrders = jest.fn((a, b) => new Decimal(b.price).minus(a.price).toNumber()); // Keep actual sort logic
const mockSortSellOrders = jest.fn((a, b) => new Decimal(a.price).minus(b.price).toNumber()); // Keep actual sort logic

// Re-exporting internal functions for mocking, or use __set__
// For this test, we'll use `__set__` to inject mocks into the module.
let getOrderBookOriginal, matchOrdersOriginal, sortBuyOrdersOriginal, sortSellOrdersOriginal;
let AVAILABLE_TRADING_PAIRS_Original; // For access to the global
let initializeTradingPairsOriginal; // For controlling initialization

beforeAll(() => {
    // Capture originals
    getOrderBookOriginal = exchangeController.__get__('getOrderBook');
    matchOrdersOriginal = exchangeController.__get__('matchOrders');
    sortBuyOrdersOriginal = exchangeController.__get__('sortBuyOrders');
    sortSellOrdersOriginal = exchangeController.__get__('sortSellOrders');
    AVAILABLE_TRADING_PAIRS_Original = exchangeController.__get__('AVAILABLE_TRADING_PAIRS');
    initializeTradingPairsOriginal = exchangeController.__get__('initializeTradingPairs');


    // Inject mocks
    exchangeController.__set__('getOrderBook', mockGetOrderBook);
    exchangeController.__set__('matchOrders', mockMatchOrders);
    exchangeController.__set__('sortBuyOrders', mockSortBuyOrders);
    exchangeController.__set__('sortSellOrders', mockSortSellOrders);

    // Provide a controlled AVAILABLE_TRADING_PAIRS for tests
    exchangeController.__set__('AVAILABLE_TRADING_PAIRS', [
        { symbol: 'BTC/USD', base: 'BTC', quote: 'USD' },
        { symbol: 'ETH/BTC', base: 'ETH', quote: 'BTC' },
        { symbol: 'AVAX/BTC', base: 'AVAX', quote: 'BTC' },
    ]);
    // Prevent actual initializeTradingPairs from running during test setup
    exchangeController.__set__('initializeTradingPairs', jest.fn());
});

afterAll(() => {
    // Restore originals
    exchangeController.__set__('getOrderBook', getOrderBookOriginal);
    exchangeController.__set__('matchOrders', matchOrdersOriginal);
    exchangeController.__set__('sortBuyOrders', sortBuyOrdersOriginal);
    exchangeController.__set__('sortSellOrders', sortSellOrdersOriginal);
    exchangeController.__set__('AVAILABLE_TRADING_PAIRS', AVAILABLE_TRADING_PAIRS_Original);
    exchangeController.__set__('initializeTradingPairs', initializeTradingPairsOriginal);
});

describe('exchangeController.placeOrder', () => {
    let req, res;
    let mockWallet;
    let orderBookState; // To hold the mock order book for each test

    beforeEach(() => {
        jest.clearAllMocks();

        mockWallet = {
            userId: 'userId123',
            _id: 'walletId123',
            balances: { 'BTC': 10, 'USD': 1000, 'ETH': 5 }, // Using object for balances as in the controller code
            save: jest.fn().mockResolvedValue(true),
        };
        Wallet.findOne.mockResolvedValue(mockWallet);

        // Reset mock order book state for each test
        orderBookState = {
            buyOrders: [],
            sellOrders: [],
        };
        mockGetOrderBook.mockReturnValue(orderBookState); // getOrderBook always returns this instance

        req = {
            user: { _id: 'userId123' },
            body: {
                pair: 'BTC/USD',
                type: 'BUY',
                amount: 0.1,
                price: 25000,
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
        test('should return 400 if missing required parameters', async () => {
            req.body.pair = undefined;
            await exchangeController.placeOrder(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, 'Missing required order parameters'));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
        });

        test('should return 400 if invalid trading pair', async () => {
            req.body.pair = 'INVALID/PAIR';
            await exchangeController.placeOrder(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, 'Invalid trading pair: INVALID/PAIR'));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
        });

        test('should return 400 if amount is zero', async () => {
            req.body.amount = 0;
            await exchangeController.placeOrder(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, 'Amount and price must be positive'));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
        });

        test('should return 400 if price is negative', async () => {
            req.body.price = -100;
            await exchangeController.placeOrder(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, 'Amount and price must be positive'));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
        });

        test('should return 400 if wallet not found', async () => {
            Wallet.findOne.mockResolvedValue(null);
            await exchangeController.placeOrder(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, 'Wallet not found'));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
        });

        test('should return 400 if insufficient quote currency balance for BUY order', async () => {
            mockWallet.balances.USD = 100; // Wallet has only 100 USD
            req.body.amount = 0.1;
            req.body.price = 25000; // Cost would be 2500 USD
            await exchangeController.placeOrder(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, 'Insufficient USD balance for buy order'));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
        });

        test('should return 400 if insufficient base currency balance for SELL order', async () => {
            req.body.type = 'SELL';
            req.body.pair = 'ETH/BTC';
            req.body.amount = 10; // Trying to sell 10 ETH
            req.body.price = 0.05;
            mockWallet.balances.ETH = 1; // Wallet has only 1 ETH
            await exchangeController.placeOrder(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, 'Insufficient ETH balance for sell order'));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
        });

        test('should return 400 for invalid order type', async () => {
            req.body.type = 'INVALID_TYPE';
            await exchangeController.placeOrder(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, 'Invalid order type'));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
        });
    });

    // --- TEST SUITE: SUCCESSFUL ORDER PLACEMENT ---
    describe('Successful Order Placement', () => {
        test('should place a BUY order and add it to the buyOrders array', async () => {
            await exchangeController.placeOrder(req, res);

            expect(mockGetOrderBook).toHaveBeenCalledWith('BTC/USD');
            expect(orderBookState.buyOrders.length).toBe(1);
            expect(orderBookState.buyOrders[0]).toMatchObject({
                userId: req.user._id,
                price: 25000,
                amount: 0.1,
            });
            expect(mockSortBuyOrders).toHaveBeenCalled(); // Ensure sorting is called
            expect(mockMatchOrders).toHaveBeenCalledWith('BTC/USD', mockSession); // Matching should be attempted

            expect(mockSession.commitTransaction).toHaveBeenCalled();
            expect(mockSession.abortTransaction).not.toHaveBeenCalled();
            expect(res.status).not.toHaveBeenCalled();
            expect(res.json).toHaveBeenCalledWith(formatResponse(true, 'Order placed successfully (BUY 0.1 at 25000 BTC/USD)'));
        });

        test('should place a SELL order and add it to the sellOrders array', async () => {
            req.body.type = 'SELL';
            req.body.pair = 'ETH/BTC';
            req.body.amount = 0.5;
            req.body.price = 0.04;
            mockWallet.balances.ETH = 1; // Ensure sufficient ETH for selling

            await exchangeController.placeOrder(req, res);

            expect(mockGetOrderBook).toHaveBeenCalledWith('ETH/BTC');
            expect(orderBookState.sellOrders.length).toBe(1);
            expect(orderBookState.sellOrders[0]).toMatchObject({
                userId: req.user._id,
                price: 0.04,
                amount: 0.5,
            });
            expect(mockSortSellOrders).toHaveBeenCalled(); // Ensure sorting is called
            expect(mockMatchOrders).toHaveBeenCalledWith('ETH/BTC', mockSession); // Matching should be attempted

            expect(mockSession.commitTransaction).toHaveBeenCalled();
            expect(mockSession.abortTransaction).not.toHaveBeenCalled();
            expect(res.status).not.toHaveBeenCalled();
            expect(res.json).toHaveBeenCalledWith(formatResponse(true, 'Order placed successfully (SELL 0.5 at 0.04 ETH/BTC)'));
        });
    });

    // --- TEST SUITE: ERROR HANDLING & TRANSACTION ROLLBACK ---
    describe('Error Handling and Transaction Rollback', () => {
        test('should abort transaction and return 400 if wallet.findOne fails', async () => {
            const dbError = new Error('DB find error');
            Wallet.findOne.mockRejectedValue(dbError);

            await exchangeController.placeOrder(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, dbError.message));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
            expect(mockSession.commitTransaction).not.toHaveBeenCalled();
            expect(logger.error).toHaveBeenCalledWith(`Error placing order: ${dbError.message}`);
        });

        test('should abort transaction and return 400 if wallet.save fails', async () => {
            const saveError = new Error('Wallet save failed during order place');
            mockWallet.save.mockRejectedValue(saveError);

            await exchangeController.placeOrder(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, saveError.message));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
            expect(mockSession.commitTransaction).not.toHaveBeenCalled();
            expect(logger.error).toHaveBeenCalledWith(`Error placing order: ${saveError.message}`);
        });

        test('should abort transaction and return 400 for any unexpected error', async () => {
            const unexpectedError = new Error('Something went wrong');
            // Simulate an error in the order book logic (e.g., in getOrderBook)
            mockGetOrderBook.mockImplementation(() => { throw unexpectedError; });

            await exchangeController.placeOrder(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, unexpectedError.message));
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
            expect(mockSession.commitTransaction).not.toHaveBeenCalled();
            expect(logger.error).toHaveBeenCalledWith(`Error placing order: ${unexpectedError.message}`);
        });
    });
});
